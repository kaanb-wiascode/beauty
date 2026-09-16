import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

const EVENTS = new Set([
  'HIRED',
  'EMPLOYMENT_TYPE_CHANGE',
  'SALARY_CHANGE',
  'COST_CENTER_CHANGE',
  'SUSPENDED',
  'REACTIVATED',
  'TERMINATED',
  'OTHER',
]);

@Injectable()
export class EmploymentHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    if (!tenantId) throw new BadRequestException('Tenant context is required.');
    if (!companyId) throw new BadRequestException('Company context is required.');
    return { tenantId, companyId };
  }

  private async branchIds(): Promise<string[] | null> {
    const scope = await this.organizationScope.getBranchScopedWhere();
    if ('branchId' in scope) {
      return typeof scope.branchId === 'string' ? [scope.branchId] : scope.branchId.in;
    }
    return null;
  }

  private branchWhere(branchIds: string[] | null) {
    return branchIds === null ? {} : { branchId: { in: branchIds } };
  }

  private date(value: unknown) {
    const parsed = value ? new Date(String(value)) : new Date();
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('effectiveFrom must be a valid date.');
    }
    return parsed.toISOString().slice(0, 10);
  }

  private async staff(id: string, branchIds: string[] | null) {
    const { tenantId, companyId } = this.context();
    const staff = await this.prisma.staff.findFirst({
      where: {
        id,
        tenantId,
        branch: { companyId },
        ...this.branchWhere(branchIds),
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        branch: { select: { companyId: true } },
      },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  async list(staffId: string) {
    const { tenantId } = this.context();
    const branchIds = await this.branchIds();
    await this.staff(staffId, branchIds);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT h.*,b.name AS "branchName"
       FROM hr_employment_history h
       JOIN branches b ON b.id=h.branch_id
       WHERE h.tenant_id=$1 AND h.staff_id=$2
         AND ($3::text[] IS NULL OR h.branch_id=ANY($3::text[]))
       ORDER BY h.effective_from DESC,h.created_at DESC`,
      tenantId,
      staffId,
      branchIds,
    );
  }

  async record(staffId: string, body: any, createdBy?: string) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const staff = await this.staff(staffId, branchIds);
    const event = String(body.eventType ?? 'OTHER').toUpperCase();
    if (!EVENTS.has(event)) throw new BadRequestException('Unsupported employment history event.');
    if (event === 'TERMINATED') {
      throw new BadRequestException('Termination events must be completed through the offboarding workflow.');
    }

    const effective = this.date(body.effectiveFrom);
    const targetBranchId = String(body.branchId ?? staff.branchId);
    if (targetBranchId !== staff.branchId) {
      throw new BadRequestException('Branch changes must be recorded through the organization assignment workflow.');
    }
    if (branchIds !== null && !branchIds.includes(targetBranchId)) {
      throw new BadRequestException('Branch is outside the active organization scope.');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: targetBranchId, companyId, company: { tenantId }, status: 'ACTIVE' },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new BadRequestException('Branch is not available in the active company.');

    const salary =
      body.grossSalary === undefined || body.grossSalary === null
        ? null
        : Number(body.grossSalary);
    if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
      throw new BadRequestException('grossSalary must be a non-negative number.');
    }
    if (event === 'SALARY_CHANGE' && salary === null) {
      throw new BadRequestException('grossSalary is required for a salary change.');
    }
    if (event === 'EMPLOYMENT_TYPE_CHANGE' && !String(body.employmentType ?? '').trim()) {
      throw new BadRequestException('employmentType is required for an employment type change.');
    }
    if (event === 'COST_CENTER_CHANGE' && !String(body.costCenterId ?? '').trim()) {
      throw new BadRequestException('costCenterId is required for a cost center change.');
    }

    return this.prisma.$transaction(async (tx) => {
      const history = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,effective_from,effective_to
         FROM hr_employment_history
         WHERE tenant_id=$1 AND staff_id=$2
         ORDER BY effective_from ASC,created_at ASC
         FOR UPDATE`,
        tenantId,
        staffId,
      );
      if (history.some((item) => String(item.effective_from).slice(0, 10) === effective)) {
        throw new BadRequestException('An employment history record already exists for this effective date.');
      }
      const previous = [...history]
        .reverse()
        .find((item) => String(item.effective_from).slice(0, 10) < effective);
      const next = history.find((item) => String(item.effective_from).slice(0, 10) > effective);
      if (previous) {
        const previousEnd = previous.effective_to
          ? String(previous.effective_to).slice(0, 10)
          : null;
        if (!previousEnd || previousEnd >= effective) {
          await tx.$executeRawUnsafe(
            `UPDATE hr_employment_history SET effective_to=($1::date-INTERVAL '1 day')::date,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
            effective,
            previous.id,
          );
        }
      }
      const effectiveTo = next
        ? new Date(new Date(next.effective_from).getTime() - 86400000)
            .toISOString()
            .slice(0, 10)
        : null;
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_employment_history(id,tenant_id,company_id,branch_id,staff_id,event_type,effective_from,effective_to,employment_type,gross_salary,salary_type,cost_center_id,reason,metadata,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,$12,$13,$14::jsonb,$15)
         RETURNING *`,
        randomUUID(),
        tenantId,
        companyId,
        targetBranchId,
        staffId,
        event,
        effective,
        effectiveTo,
        body.employmentType ?? null,
        salary,
        body.salaryType ?? null,
        body.costCenterId ?? null,
        body.reason ?? null,
        JSON.stringify(body.metadata ?? {}),
        createdBy ?? null,
      );

      if (!next) {
        if (event === 'REACTIVATED') {
          await tx.staff.update({ where: { id: staffId }, data: { status: 'ACTIVE' } });
          await tx.$executeRawUnsafe(
            `UPDATE employee_master_records SET termination_date=NULL,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND staff_id=$2`,
            tenantId,
            staffId,
          );
        }
        if (body.employmentType !== undefined || salary !== null || body.salaryType !== undefined) {
          await tx.$executeRawUnsafe(
            `UPDATE employee_master_records SET employment_type=COALESCE($1,employment_type),gross_salary=COALESCE($2,gross_salary),salary_type=COALESCE($3,salary_type),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$4 AND staff_id=$5`,
            body.employmentType ?? null,
            salary,
            body.salaryType ?? null,
            tenantId,
            staffId,
          );
        }
      }
      return rows[0];
    });
  }
}
