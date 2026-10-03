import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

const OFFBOARDING_TASKS = [
  ['FINAL_PAYROLL', 'Final bordro ve hakediş kontrolü'],
  ['LEAVE_SETTLEMENT', 'Kullanılmamış izin mutabakatı'],
  ['ADVANCE_EXPENSE', 'Avans ve masraf mutabakatı'],
  ['ACCESS_CLOSURE', 'Sistem erişimlerinin kapatılması'],
  ['ASSET_RETURN', 'Zimmet ve demirbaş iadesi'],
  ['PERSONNEL_FILE', 'Personel dosyasının arşivlenmesi'],
] as const;

@Injectable()
export class ProbationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private context() {
    const tenantId = this.ctx.getTenantId();
    const companyId = this.ctx.getCompanyId();
    if (!tenantId) throw new BadRequestException('Tenant context is required.');
    if (!companyId) throw new BadRequestException('Company context is required.');
    return { tenantId, companyId };
  }

  private async branchIds() {
    const scope = await this.organizationScope.getBranchScopedWhere();
    if ('branchId' in scope) {
      return typeof scope.branchId === 'string' ? [scope.branchId] : scope.branchId.in;
    }
    return null;
  }

  private async staff(id: string) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        tenantId,
        branch: { companyId },
        ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
      },
      select: { id: true, status: true, branchId: true, branch: { select: { companyId: true } } },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  private date(value: unknown) {
    const date = value ? new Date(String(value)) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date.');
    return date.toISOString().slice(0, 10);
  }

  private plus(value: string, days: number) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  async get(staffId: string) {
    const { tenantId, companyId } = this.context();
    const staff = await this.staff(staffId);
    const periods = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM hr_probation_periods
       WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND staff_id=$4
       ORDER BY started_at DESC,created_at DESC`,
      tenantId,
      companyId,
      staff.branchId,
      staffId,
    );
    const current = periods.find((row) => row.status === 'ACTIVE') ?? periods[0] ?? null;
    const reviews = current
      ? await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,s."firstName" AS "reviewerFirstName",s."lastName" AS "reviewerLastName"
           FROM hr_probation_reviews r
           LEFT JOIN staff s ON s.id=r.reviewer_staff_id AND s."tenantId"=$1 AND s."branchId"=$3
           WHERE r.tenant_id=$1 AND r.probation_id=$2
           ORDER BY r.review_day`,
          tenantId,
          current.id,
          staff.branchId,
        )
      : [];
    return { periods, current, reviews };
  }

  async start(staffId: string, body: any, userId: string) {
    const { tenantId, companyId } = this.context();
    const staff = await this.staff(staffId);
    const started = this.date(body.startedAt);
    const end = this.date(body.endAt ?? this.plus(started, 90));
    const id = randomUUID();
    if (staff.status !== 'ACTIVE') throw new BadRequestException('Probation can only be started for active staff.');
    if (end < started) throw new BadRequestException('Probation end date cannot precede start date.');

    const reviewer = body.reviewerStaffId ?? null;
    if (reviewer) {
      if (reviewer === staffId) throw new BadRequestException('Employee cannot review their own probation.');
      const reviewerStaff = await this.prisma.staff.findFirst({
        where: { id: reviewer, tenantId, branchId: staff.branchId, branch: { companyId }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!reviewerStaff) throw new BadRequestException('Reviewer must be active and within the employee branch scope.');
    }

    return this.prisma.$transaction(async (tx) => {
      const lockedStaff = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM staff
         WHERE id=$1 AND "tenantId"=$2 AND "branchId"=$3
         FOR UPDATE`,
        staffId,
        tenantId,
        staff.branchId,
      );
      if (!lockedStaff.length) throw new NotFoundException('Staff not found');

      const active = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM hr_probation_periods
         WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND staff_id=$4 AND status='ACTIVE'
         FOR UPDATE`,
        tenantId,
        companyId,
        staff.branchId,
        staffId,
      );
      if (active.length) throw new BadRequestException('An active probation period already exists.');

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_probation_periods(id,tenant_id,company_id,branch_id,staff_id,started_at,end_at,status,created_by)
         VALUES($1,$2,$3,$4,$5,$6::date,$7::date,'ACTIVE',$8)
         RETURNING *`,
        id,
        tenantId,
        companyId,
        staff.branchId,
        staffId,
        started,
        end,
        userId,
      );
      for (const day of [30, 60, 90]) {
        await tx.$executeRawUnsafe(
          `INSERT INTO hr_probation_reviews(id,tenant_id,probation_id,review_day,scheduled_date,reviewer_staff_id)
           VALUES($1,$2,$3,$4,$5::date,$6)`,
          randomUUID(),
          tenantId,
          id,
          day,
          this.plus(started, day),
          reviewer,
        );
      }
      return rows[0];
    });
  }

  async review(staffId: string, reviewId: string, body: any, userId: string) {
    const { tenantId, companyId } = this.context();
    const staff = await this.staff(staffId);
    const status = String(body.status ?? 'COMPLETED').toUpperCase();
    if (!['COMPLETED', 'SKIPPED'].includes(status)) throw new BadRequestException('Invalid review status.');
    if (status === 'SKIPPED' && !String(body.managerNote ?? '').trim()) {
      throw new BadRequestException('A manager note is required when skipping a probation review.');
    }
    const rating = body.rating == null ? null : Number(body.rating);
    if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      throw new BadRequestException('Rating must be between 0 and 5.');
    }
    if (status === 'COMPLETED' && rating == null) throw new BadRequestException('Rating is required for a completed probation review.');

    await this.prisma.$transaction(async (tx) => {
      const row = (
        await tx.$queryRawUnsafe<any[]>(
          `SELECT r.*,p.staff_id,p.status AS "probationStatus"
           FROM hr_probation_reviews r
           JOIN hr_probation_periods p ON p.id=r.probation_id
           WHERE r.id=$1 AND r.tenant_id=$2 AND p.company_id=$3 AND p.branch_id=$4 AND p.staff_id=$5
           FOR UPDATE`,
          reviewId,
          tenantId,
          companyId,
          staff.branchId,
          staffId,
        )
      )[0];
      if (!row) throw new NotFoundException('Probation review not found');
      if (row.probationStatus !== 'ACTIVE') throw new BadRequestException('Probation period is not active.');
      if (['COMPLETED', 'SKIPPED'].includes(row.status)) throw new BadRequestException('Probation review is already finalized.');
      await tx.$executeRawUnsafe(
        `UPDATE hr_probation_reviews
         SET status=$1,rating=$2,strengths=$3,development_areas=$4,manager_note=$5,completed_by=$6,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE id=$7 AND tenant_id=$8`,
        status,
        rating,
        body.strengths ?? null,
        body.developmentAreas ?? null,
        body.managerNote ?? null,
        userId,
        reviewId,
        tenantId,
      );
    });
    return this.get(staffId);
  }

  async decide(staffId: string, body: any, userId: string) {
    const { tenantId, companyId } = this.context();
    const staff = await this.staff(staffId);
    const decision = String(body.decision ?? '').toUpperCase();
    if (!['CONFIRMED', 'EXTENDED', 'TERMINATED'].includes(decision)) throw new BadRequestException('Invalid probation decision.');

    return this.prisma.$transaction(async (tx) => {
      const lockedStaff = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM staff
         WHERE id=$1 AND "tenantId"=$2 AND "branchId"=$3
         FOR UPDATE`,
        staffId,
        tenantId,
        staff.branchId,
      );
      if (!lockedStaff.length) throw new NotFoundException('Staff not found');

      const probation = (
        await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM hr_probation_periods
           WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND staff_id=$4 AND status='ACTIVE'
           FOR UPDATE`,
          tenantId,
          companyId,
          staff.branchId,
          staffId,
        )
      )[0];
      if (!probation) throw new NotFoundException('Active probation period not found');

      if (decision === 'EXTENDED') {
        if (!body.endAt) throw new BadRequestException('endAt is required when extending probation.');
        const newEnd = this.date(body.endAt);
        if (newEnd <= this.date(probation.end_at)) throw new BadRequestException('Extended end date must be later than current end date.');
        await tx.$executeRawUnsafe(
          `UPDATE hr_probation_periods
           SET end_at=$1::date,final_decision='EXTENDED',decision_note=$2,decided_by=$3,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           WHERE id=$4 AND tenant_id=$5 AND company_id=$6 AND branch_id=$7`,
          newEnd,
          body.note ?? null,
          userId,
          probation.id,
          tenantId,
          companyId,
          staff.branchId,
        );
        return { decision, requiresOffboarding: false };
      }

      const pending = (
        await tx.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS count
           FROM hr_probation_reviews
           WHERE tenant_id=$1 AND probation_id=$2 AND status NOT IN ('COMPLETED','SKIPPED')`,
          tenantId,
          probation.id,
        )
      )[0]?.count ?? 0;
      if (pending > 0 && !body.forceDecision) throw new BadRequestException(`Probation has ${pending} unfinished review(s).`);

      await tx.$executeRawUnsafe(
        `UPDATE hr_probation_periods
         SET status='COMPLETED',final_decision=$1,decision_note=$2,decided_by=$3,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE id=$4 AND tenant_id=$5 AND company_id=$6 AND branch_id=$7`,
        decision,
        body.note ?? null,
        userId,
        probation.id,
        tenantId,
        companyId,
        staff.branchId,
      );

      if (decision !== 'TERMINATED') return { decision, requiresOffboarding: false };

      let plan = (
        await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM hr_offboarding_plans
           WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND staff_id=$4 AND status='ACTIVE'
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          tenantId,
          companyId,
          staff.branchId,
          staffId,
        )
      )[0] ?? null;
      let created = false;

      if (!plan) {
        const terminationDate = this.date(body.terminationDate ?? new Date());
        const master = (
          await tx.$queryRawUnsafe<any[]>(
            `SELECT hire_date FROM employee_master_records
             WHERE tenant_id=$1 AND company_id=$2 AND branch_id=$3 AND staff_id=$4
             FOR UPDATE`,
            tenantId,
            companyId,
            staff.branchId,
            staffId,
          )
        )[0];
        if (master?.hire_date && terminationDate < String(master.hire_date).slice(0, 10)) {
          throw new BadRequestException('Termination date cannot precede hire date.');
        }
        const reason = String(body.terminationReason ?? body.note ?? 'Probation period terminated').trim() || 'Probation period terminated';
        const planId = randomUUID();
        plan = (
          await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO hr_offboarding_plans(id,tenant_id,company_id,branch_id,staff_id,termination_date,termination_reason,status,created_by)
             VALUES($1,$2,$3,$4,$5,$6::date,$7,'ACTIVE',$8)
             RETURNING *`,
            planId,
            tenantId,
            companyId,
            staff.branchId,
            staffId,
            terminationDate,
            reason,
            userId,
          )
        )[0];
        for (let index = 0; index < OFFBOARDING_TASKS.length; index += 1) {
          const task = OFFBOARDING_TASKS[index];
          await tx.$executeRawUnsafe(
            `INSERT INTO hr_offboarding_tasks(id,tenant_id,plan_id,task_type,title,due_date,sort_order)
             VALUES($1,$2,$3,$4,$5,$6::date,$7)`,
            randomUUID(),
            tenantId,
            planId,
            task[0],
            task[1],
            terminationDate,
            index,
          );
        }
        created = true;
      }

      return { decision, requiresOffboarding: true, offboardingPlan: plan, offboardingCreated: created };
    });
  }
}
