import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { randomUUID } from 'node:crypto';

const DEFAULT_TASKS = ['Employment contract','Identity document','Bank details','SGK registration','KVKK documents','Uniform assignment','User account creation','Branch assignment','Device training','Service training','Occupational safety training','Mentor assignment','30-day evaluation'];

@Injectable()
export class OnboardingService {
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

  private date(value: any, name: string) {
    if (value == null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${name}.`);
    return date.toISOString().slice(0, 10);
  }

  async get(staffId: string) {
    const { staff, tenantId, branchIds } = await this.staff(staffId);
    const plans = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM hr_onboarding_plans
       WHERE tenant_id=$1 AND staff_id=$2
         AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))
       ORDER BY created_at DESC`,
      tenantId,
      staff.id,
      branchIds,
    );
    if (!plans.length) return { plans: [], current: null, tasks: [], progress: 0 };
    const current = plans.find((item) => item.status === 'ACTIVE') ?? plans[0];
    const tasks = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.*,o."firstName" AS "ownerFirstName",o."lastName" AS "ownerLastName"
       FROM hr_onboarding_tasks t
       LEFT JOIN staff o ON o.id=t.owner_staff_id AND o."tenantId"=$1
         AND ($3::text[] IS NULL OR o."branchId"=ANY($3::text[]))
       WHERE t.tenant_id=$1 AND t.plan_id=$2
       ORDER BY t.sort_order,t.created_at`,
      tenantId,
      current.id,
      branchIds,
    );
    const done = tasks.filter((item) => item.status === 'COMPLETED' || item.status === 'SKIPPED').length;
    return { plans, current, tasks, progress: tasks.length ? Math.round(done * 100 / tasks.length) : 0 };
  }

  async create(staffId: string, body: any, userId: string) {
    const { staff, tenantId, branchIds } = await this.staff(staffId);
    const id = randomUUID();
    const name = String(body.name ?? 'Employee Onboarding').trim();
    if (!name) throw new BadRequestException('name is required.');
    if (staff.status !== 'ACTIVE') throw new BadRequestException('Onboarding can only be started for active staff.');
    const startedAt = this.date(body.startedAt, 'startedAt');
    const target = this.date(body.targetCompletionDate, 'targetCompletionDate');
    if (startedAt && target && target < startedAt) throw new BadRequestException('Target completion date cannot precede onboarding start date.');
    const raw = Array.isArray(body.tasks) && body.tasks.length ? body.tasks : DEFAULT_TASKS;
    const titles = raw.map((item: any) => String(typeof item === 'string' ? item : item?.title ?? '').trim()).filter(Boolean);
    if (!titles.length) throw new BadRequestException('At least one onboarding task is required.');
    if (new Set(titles.map((title: string) => title.toLocaleLowerCase('en-US'))).size !== titles.length) throw new BadRequestException('Onboarding task titles must be unique.');

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1 AND s."tenantId"=$2 AND b."companyId"=$3
           AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[]))
         FOR UPDATE`,
        staffId,
        tenantId,
        staff.branch.companyId,
        branchIds,
      );
      if (!locked.length) throw new NotFoundException('Staff not found');
      const active = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM hr_onboarding_plans
         WHERE tenant_id=$1 AND staff_id=$2 AND status='ACTIVE'
           AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))
         FOR UPDATE`,
        tenantId,
        staffId,
        branchIds,
      );
      if (active.length) throw new BadRequestException('An active onboarding plan already exists.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_onboarding_plans(id,tenant_id,company_id,branch_id,staff_id,name,status,started_at,target_completion_date,created_by)
         VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',COALESCE($7::date,CURRENT_DATE),$8::date,$9) RETURNING *`,
        id,
        tenantId,
        staff.branch.companyId,
        staff.branchId,
        staffId,
        name,
        startedAt,
        target,
        userId,
      );
      for (let index = 0; index < titles.length; index++) {
        await tx.$executeRawUnsafe(
          `INSERT INTO hr_onboarding_tasks(id,tenant_id,plan_id,title,sort_order) VALUES($1,$2,$3,$4,$5)`,
          randomUUID(), tenantId, id, titles[index], index,
        );
      }
      return rows[0];
    });
  }

  async updateTask(staffId: string, taskId: string, body: any, userId: string) {
    const { staff, tenantId, companyId, branchIds } = await this.staff(staffId);
    const status = String(body.status ?? '').toUpperCase();
    if (!['PENDING','IN_PROGRESS','COMPLETED','SKIPPED','BLOCKED'].includes(status)) throw new BadRequestException('Invalid onboarding task status.');
    if (status === 'SKIPPED' && !String(body.completionNote ?? '').trim()) throw new BadRequestException('A completion note is required when skipping an onboarding task.');
    const dueDate = this.date(body.dueDate, 'dueDate');
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
         FROM hr_onboarding_tasks t JOIN hr_onboarding_plans p ON p.id=t.plan_id
         WHERE t.id=$1 AND t.tenant_id=$2 AND p.staff_id=$3
           AND p.company_id=$4
           AND ($5::text[] IS NULL OR p.branch_id=ANY($5::text[]))
         FOR UPDATE`,
        taskId,
        tenantId,
        staff.id,
        companyId,
        branchIds,
      ))[0];
      if (!task) throw new NotFoundException('Onboarding task not found');
      if (task.planStatus !== 'ACTIVE') throw new BadRequestException('Onboarding plan is not active.');
      if (status === 'COMPLETED' && task.depends_on_task_id) {
        const dependency = (await tx.$queryRawUnsafe<any[]>(
          `SELECT status FROM hr_onboarding_tasks WHERE id=$1 AND tenant_id=$2 AND plan_id=$3 FOR UPDATE`,
          task.depends_on_task_id, tenantId, task.plan_id,
        ))[0];
        if (!dependency) throw new BadRequestException('Dependent onboarding task is invalid.');
        if (!['COMPLETED','SKIPPED'].includes(dependency.status)) throw new BadRequestException('Dependent onboarding task must be completed first.');
      }
      await tx.$executeRawUnsafe(
        `UPDATE hr_onboarding_tasks
         SET status=$1,owner_staff_id=COALESCE($2,owner_staff_id),due_date=COALESCE($3::date,due_date),completion_note=COALESCE($4,completion_note),completed_at=CASE WHEN $1 IN ('COMPLETED','SKIPPED') THEN CURRENT_TIMESTAMP ELSE NULL END,completed_by=CASE WHEN $1 IN ('COMPLETED','SKIPPED') THEN $5 ELSE NULL END,updated_at=CURRENT_TIMESTAMP
         WHERE id=$6 AND tenant_id=$7`,
        status, body.ownerStaffId ?? null, dueDate, body.completionNote ?? null, userId, taskId, tenantId,
      );
      const remaining = (await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count FROM hr_onboarding_tasks WHERE tenant_id=$1 AND plan_id=$2 AND status NOT IN ('COMPLETED','SKIPPED')`,
        tenantId, task.plan_id,
      ))[0]?.count ?? 0;
      if (remaining === 0) {
        await tx.$executeRawUnsafe(
          `UPDATE hr_onboarding_plans SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
          task.plan_id, tenantId,
        );
      }
      return { planId: task.plan_id, status };
    }).then(() => this.get(staffId));
  }
}
