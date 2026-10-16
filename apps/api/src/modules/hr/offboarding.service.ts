import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { randomUUID } from 'node:crypto';

const TASKS = [
  ['FINAL_PAYROLL','Final bordro ve hakediş kontrolü'],
  ['LEAVE_SETTLEMENT','Kullanılmamış izin mutabakatı'],
  ['ADVANCE_EXPENSE','Avans ve masraf mutabakatı'],
  ['ACCESS_CLOSURE','Sistem erişimlerinin kapatılması'],
  ['ASSET_RETURN','Zimmet ve demirbaş iadesi'],
  ['PERSONNEL_FILE','Personel dosyasının arşivlenmesi'],
] as const;

@Injectable()
export class OffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private async scope() {
    const scope = await this.organizationScope.getBranchScopedWhere();
    const companyId = this.ctx.getCompanyId();
    const branchIds = 'branchId' in scope
      ? (typeof scope.branchId === 'string' ? [scope.branchId] : scope.branchId.in)
      : null;
    return { tenantId: scope.tenantId, companyId, branchIds };
  }

  private staffWhere(id: string, tenantId: string, companyId: string, branchIds: string[] | null) {
    return {
      id,
      tenantId,
      branch: { companyId },
      ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
    } as any;
  }

  private async staff(id: string) {
    const { tenantId, companyId, branchIds } = await this.scope();
    const staff = await this.prisma.staff.findFirst({
      where: this.staffWhere(id, tenantId, companyId, branchIds),
      select: { id: true, status: true, branchId: true, branch: { select: { companyId: true } } },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return { staff, tenantId, companyId, branchIds };
  }

  private date(value: any) {
    if (!value) throw new BadRequestException('terminationDate is required.');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid terminationDate.');
    return date.toISOString().slice(0, 10);
  }

  private day(value: any) { return String(value ?? '').slice(0, 10); }

  async get(staffId: string) {
    const { staff, tenantId, branchIds } = await this.staff(staffId);
    const plans = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM hr_offboarding_plans
       WHERE tenant_id=$1 AND staff_id=$2
         AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))
       ORDER BY termination_date DESC,created_at DESC`,
      tenantId,
      staff.id,
      branchIds,
    );
    const current = plans.find((item) => item.status === 'ACTIVE') ?? plans[0] ?? null;
    const tasks = current ? await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.*,s."firstName" AS "ownerFirstName",s."lastName" AS "ownerLastName"
       FROM hr_offboarding_tasks t
       LEFT JOIN staff s ON s.id=t.owner_staff_id AND s."tenantId"=$1
         AND ($3::text[] IS NULL OR s."branchId"=ANY($3::text[]))
       WHERE t.tenant_id=$1 AND t.plan_id=$2 ORDER BY t.sort_order`,
      tenantId,
      current.id,
      branchIds,
    ) : [];
    return {
      plans,
      current,
      tasks,
      progress: tasks.length ? Math.round(tasks.filter((item) => ['COMPLETED','SKIPPED'].includes(item.status)).length * 100 / tasks.length) : 0,
    };
  }

  async start(staffId: string, body: any, userId: string) {
    const { staff, tenantId, branchIds } = await this.staff(staffId);
    const terminationDate = this.date(body.terminationDate);
    const reason = String(body.reason ?? '').trim();
    if (!reason) throw new BadRequestException('termination reason is required.');
    const master = (await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT hire_date,termination_date FROM employee_master_records
       WHERE tenant_id=$1 AND staff_id=$2 AND ($3::text[] IS NULL OR branch_id=ANY($3::text[])) LIMIT 1`,
      tenantId, staffId, branchIds,
    ))[0];
    if (master?.hire_date && terminationDate < this.day(master.hire_date)) throw new BadRequestException('Termination date cannot precede hire date.');
    if (staff.status === 'INACTIVE' || master?.termination_date) throw new BadRequestException('Staff is already terminated.');
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1 AND s."tenantId"=$2 AND b."companyId"=$3
           AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[]))
         FOR UPDATE`,
        staffId, tenantId, staff.branch.companyId, branchIds,
      );
      if (!locked.length) throw new NotFoundException('Staff not found');
      const active = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM hr_offboarding_plans
         WHERE tenant_id=$1 AND staff_id=$2 AND status='ACTIVE'
           AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))
         FOR UPDATE`,
        tenantId, staffId, branchIds,
      );
      if (active.length) throw new BadRequestException('An active offboarding plan already exists.');
      const plan = (await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_offboarding_plans(id,tenant_id,company_id,branch_id,staff_id,termination_date,termination_reason,status,created_by)
         VALUES($1,$2,$3,$4,$5,$6::date,$7,'ACTIVE',$8) RETURNING *`,
        id, tenantId, staff.branch.companyId, staff.branchId, staffId, terminationDate, reason, userId,
      ))[0];
      for (let index = 0; index < TASKS.length; index++) {
        await tx.$executeRawUnsafe(
          `INSERT INTO hr_offboarding_tasks(id,tenant_id,plan_id,task_type,title,due_date,sort_order) VALUES($1,$2,$3,$4,$5,$6::date,$7)`,
          randomUUID(), tenantId, id, TASKS[index][0], TASKS[index][1], terminationDate, index,
        );
      }
      return plan;
    });
  }

  async updateTask(staffId: string, taskId: string, body: any, userId: string) {
    const { staff, tenantId, companyId, branchIds } = await this.staff(staffId);
    const status = String(body.status ?? '').toUpperCase();
    if (!['PENDING','IN_PROGRESS','COMPLETED','SKIPPED','BLOCKED'].includes(status)) throw new BadRequestException('Invalid offboarding task status.');
    if (status === 'SKIPPED' && !String(body.completionNote ?? '').trim()) throw new BadRequestException('A completion note is required when skipping an offboarding task.');
    if (body.ownerStaffId) {
      const owner = await this.prisma.staff.findFirst({
        where: { ...this.staffWhere(body.ownerStaffId, tenantId, companyId, branchIds), status: 'ACTIVE' },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException('Task owner must be an active staff member in the active organization scope.');
    }

    return this.prisma.$transaction(async (tx) => {
      const task = (await tx.$queryRawUnsafe<any[]>(
        `SELECT t.*,p.staff_id,p.status AS "planStatus"
         FROM hr_offboarding_tasks t JOIN hr_offboarding_plans p ON p.id=t.plan_id
         WHERE t.id=$1 AND t.tenant_id=$2 AND p.staff_id=$3 AND p.company_id=$4
           AND ($5::text[] IS NULL OR p.branch_id=ANY($5::text[]))
         FOR UPDATE`,
        taskId, tenantId, staff.id, companyId, branchIds,
      ))[0];
      if (!task) throw new NotFoundException('Offboarding task not found');
      if (task.planStatus !== 'ACTIVE') throw new BadRequestException('Offboarding plan is not active.');
      await tx.$executeRawUnsafe(
        `UPDATE hr_offboarding_tasks SET status=$1,owner_staff_id=COALESCE($2,owner_staff_id),completion_note=COALESCE($3,completion_note),completed_by=CASE WHEN $1 IN ('COMPLETED','SKIPPED') THEN $4 ELSE NULL END,completed_at=CASE WHEN $1 IN ('COMPLETED','SKIPPED') THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$5 AND tenant_id=$6`,
        status, body.ownerStaffId ?? null, body.completionNote ?? null, userId, taskId, tenantId,
      );
      const columns: Record<string,string> = { FINAL_PAYROLL:'final_payroll_status', LEAVE_SETTLEMENT:'leave_settlement_status', ADVANCE_EXPENSE:'advance_expense_status', ACCESS_CLOSURE:'access_closure_status', ASSET_RETURN:'asset_return_status', PERSONNEL_FILE:'personnel_file_status' };
      const column = columns[task.task_type];
      if (column) await tx.$executeRawUnsafe(`UPDATE hr_offboarding_plans SET ${column}=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3`, status, task.plan_id, tenantId);
      return { planId: task.plan_id, status };
    }).then(() => this.get(staffId));
  }

  async complete(staffId: string, userId: string) {
    const { staff, tenantId, companyId, branchIds } = await this.staff(staffId);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1 AND s."tenantId"=$2 AND b."companyId"=$3
           AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[])) FOR UPDATE`,
        staffId, tenantId, companyId, branchIds,
      );
      if (!locked.length) throw new NotFoundException('Staff not found');
      const plan = (await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM hr_offboarding_plans
         WHERE tenant_id=$1 AND staff_id=$2 AND status='ACTIVE' AND company_id=$3
           AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
         FOR UPDATE`,
        tenantId, staffId, companyId, branchIds,
      ))[0];
      if (!plan) {
        const completed = (await tx.$queryRawUnsafe<any[]>(
          `SELECT termination_date FROM hr_offboarding_plans
           WHERE tenant_id=$1 AND staff_id=$2 AND status='COMPLETED' AND company_id=$3
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           ORDER BY completed_at DESC NULLS LAST LIMIT 1`,
          tenantId, staffId, companyId, branchIds,
        ))[0];
        if (completed) return { status: 'COMPLETED', terminationDate: completed.termination_date, idempotent: true };
        throw new NotFoundException('Active offboarding plan not found');
      }
      const pending = await tx.$queryRawUnsafe<any[]>(
        `SELECT task_type,title,status FROM hr_offboarding_tasks WHERE tenant_id=$1 AND plan_id=$2 AND status NOT IN ('COMPLETED','SKIPPED') FOR UPDATE`,
        tenantId, plan.id,
      );
      if (pending.length) throw new BadRequestException(`Offboarding has ${pending.length} unfinished task(s).`);
      const master = (await tx.$queryRawUnsafe<any[]>(
        `SELECT hire_date,termination_date FROM employee_master_records
         WHERE tenant_id=$1 AND staff_id=$2 AND branch_id=$3 FOR UPDATE`,
        tenantId, staffId, plan.branch_id,
      ))[0];
      const terminationDate = this.day(plan.termination_date);
      if (master?.hire_date && terminationDate < this.day(master.hire_date)) throw new BadRequestException('Termination date cannot precede hire date.');
      if (master?.termination_date && this.day(master.termination_date) !== terminationDate) throw new BadRequestException('Staff already has a different termination date.');
      const duplicate = (await tx.$queryRawUnsafe<any[]>(
        `SELECT id,event_type FROM hr_employment_history WHERE tenant_id=$1 AND staff_id=$2 AND branch_id=$3 AND effective_from=$4::date FOR UPDATE`,
        tenantId, staffId, plan.branch_id, terminationDate,
      ))[0];
      if (duplicate && duplicate.event_type !== 'TERMINATED') throw new BadRequestException('Another employment history event already exists on the termination date.');
      await tx.$executeRawUnsafe(`UPDATE hr_offboarding_plans SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2`, plan.id, tenantId);
      await tx.staff.update({ where: { id: staff.id }, data: { status: 'INACTIVE' } });
      await tx.$executeRawUnsafe(`UPDATE employee_master_records SET termination_date=$1::date,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND staff_id=$3 AND branch_id=$4`, terminationDate, tenantId, staffId, plan.branch_id);
      await tx.$executeRawUnsafe(`UPDATE hr_employee_assignments SET effective_to=$1::date,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND staff_id=$3 AND branch_id=$4 AND effective_from<=$1::date AND (effective_to IS NULL OR effective_to>$1::date)`, terminationDate, tenantId, staffId, plan.branch_id);
      if (!duplicate) {
        const current = (await tx.$queryRawUnsafe<any[]>(
          `SELECT id,effective_from FROM hr_employment_history
           WHERE tenant_id=$1 AND staff_id=$2 AND branch_id=$3 AND effective_from<$4::date AND (effective_to IS NULL OR effective_to>=$4::date)
           ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`,
          tenantId, staffId, plan.branch_id, terminationDate,
        ))[0];
        if (current) await tx.$executeRawUnsafe(`UPDATE hr_employment_history SET effective_to=($1::date-INTERVAL '1 day')::date,updated_at=CURRENT_TIMESTAMP WHERE id=$2`, terminationDate, current.id);
        const future = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,effective_from FROM hr_employment_history WHERE tenant_id=$1 AND staff_id=$2 AND branch_id=$3 AND effective_from>$4::date ORDER BY effective_from ASC LIMIT 1 FOR UPDATE`,
          tenantId, staffId, plan.branch_id, terminationDate,
        );
        if (future.length) throw new BadRequestException('Future employment history exists after the termination date.');
        await tx.$executeRawUnsafe(
          `INSERT INTO hr_employment_history(id,tenant_id,company_id,branch_id,staff_id,event_type,effective_from,effective_to,reason,created_by) VALUES($1,$2,$3,$4,$5,'TERMINATED',$6::date,NULL,$7,$8)`,
          randomUUID(), tenantId, plan.company_id, plan.branch_id, staffId, terminationDate, plan.termination_reason, userId,
        );
      }
      return { status: 'COMPLETED', terminationDate };
    });
  }
}
