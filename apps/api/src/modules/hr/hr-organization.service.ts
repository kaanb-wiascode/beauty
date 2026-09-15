import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class HrOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private scope() {
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

  private text(value: unknown, name: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new BadRequestException(`${name} is required.`);
    return normalized;
  }

  async structure() {
    const { tenantId, companyId } = this.scope();
    const [departments, teams, positions] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT d.* FROM hr_departments d WHERE d.tenant_id=$1 AND d.company_id=$2 ORDER BY d.name`,
        tenantId,
        companyId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT t.* FROM hr_teams t JOIN hr_departments d ON d.id=t.department_id WHERE t.tenant_id=$1 AND d.company_id=$2 ORDER BY t.name`,
        tenantId,
        companyId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT p.* FROM hr_positions p WHERE p.tenant_id=$1 AND p.company_id=$2 ORDER BY p.name`,
        tenantId,
        companyId,
      ),
    ]);
    return { departments, teams, positions };
  }

  async createDepartment(body: any) {
    const { tenantId, companyId } = this.scope();
    if (body.companyId && body.companyId !== companyId) {
      throw new BadRequestException('Department company must match the active company context.');
    }
    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_departments(id,tenant_id,company_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        randomUUID(),
        tenantId,
        companyId,
        this.text(body.code, 'code'),
        this.text(body.name, 'name'),
        body.status ?? 'ACTIVE',
      )
    )[0];
  }

  async createTeam(body: any) {
    const { tenantId, companyId } = this.scope();
    const departmentId = this.text(body.departmentId, 'departmentId');
    const department = (
      await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
        departmentId,
        tenantId,
        companyId,
      )
    )[0];
    if (!department) throw new BadRequestException('Department is not available in the active company.');
    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_teams(id,tenant_id,department_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        randomUUID(),
        tenantId,
        departmentId,
        this.text(body.code, 'code'),
        this.text(body.name, 'name'),
        body.status ?? 'ACTIVE',
      )
    )[0];
  }

  async createPosition(body: any) {
    const { tenantId, companyId } = this.scope();
    if (body.companyId && body.companyId !== companyId) {
      throw new BadRequestException('Position company must match the active company context.');
    }
    if (
      body.departmentId &&
      !(
        await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
          body.departmentId,
          tenantId,
          companyId,
        )
      )[0]
    ) {
      throw new BadRequestException('Department is not available in the active company.');
    }
    if (
      body.parentPositionId &&
      !(
        await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM hr_positions WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
          body.parentPositionId,
          tenantId,
          companyId,
        )
      )[0]
    ) {
      throw new BadRequestException('Parent position is not available in the active company.');
    }
    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_positions(id,tenant_id,company_id,department_id,parent_position_id,code,name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        randomUUID(),
        tenantId,
        companyId,
        body.departmentId ?? null,
        body.parentPositionId ?? null,
        this.text(body.code, 'code'),
        this.text(body.name, 'name'),
        body.status ?? 'ACTIVE',
      )
    )[0];
  }

  async employeeHistory(staffId: string) {
    const { tenantId } = this.scope();
    const branchIds = await this.branchIds();
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, ...this.branchWhere(branchIds) },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*,d.name AS "departmentName",t.name AS "teamName",p.name AS "positionName",m."firstName" AS "managerFirstName",m."lastName" AS "managerLastName"
       FROM hr_employee_assignments a
       LEFT JOIN hr_departments d ON d.id=a.department_id
       LEFT JOIN hr_teams t ON t.id=a.team_id
       LEFT JOIN hr_positions p ON p.id=a.position_id
       LEFT JOIN staff m ON m.id=a.manager_staff_id
       WHERE a.tenant_id=$1 AND a.staff_id=$2 AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[]))
       ORDER BY a.effective_from DESC,a.created_at DESC`,
      tenantId,
      staffId,
      branchIds,
    );
  }

  async assign(staffId: string, body: any) {
    const { tenantId, companyId } = this.scope();
    const branchIds = await this.branchIds();
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, ...this.branchWhere(branchIds) },
      select: { id: true, branchId: true, branch: { select: { companyId: true } } },
    });
    if (!staff || staff.branch.companyId !== companyId) throw new NotFoundException('Staff not found');

    const targetBranchId = body.branchId ?? staff.branchId;
    if (branchIds !== null && !branchIds.includes(targetBranchId)) {
      throw new BadRequestException('Target branch is outside the active organization scope.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: targetBranchId, companyId, company: { tenantId }, status: 'ACTIVE' },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new BadRequestException('Branch is not available in the active company.');

    let team: any = null;
    let position: any = null;
    if (body.departmentId) {
      const department = (
        await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id,company_id FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
          body.departmentId,
          tenantId,
          companyId,
        )
      )[0];
      if (!department) throw new BadRequestException('Department is not available in the target company.');
    }
    if (body.teamId) {
      team = (
        await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT t.id,t.department_id FROM hr_teams t JOIN hr_departments d ON d.id=t.department_id WHERE t.id=$1 AND t.tenant_id=$2 AND d.company_id=$3 LIMIT 1`,
          body.teamId,
          tenantId,
          companyId,
        )
      )[0];
      if (!team) throw new BadRequestException('Team is not available in the target company.');
      if (body.departmentId && team.department_id !== body.departmentId) {
        throw new BadRequestException('Team does not belong to the selected department.');
      }
    }
    if (body.positionId) {
      position = (
        await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id,department_id FROM hr_positions WHERE id=$1 AND tenant_id=$2 AND company_id=$3 LIMIT 1`,
          body.positionId,
          tenantId,
          companyId,
        )
      )[0];
      if (!position) throw new BadRequestException('Position is not available in the target company.');
      if (position.department_id && body.departmentId && position.department_id !== body.departmentId) {
        throw new BadRequestException('Position does not belong to the selected department.');
      }
    }

    if (body.managerStaffId === staffId) {
      throw new BadRequestException('An employee cannot be their own manager.');
    }
    if (body.managerStaffId) {
      const manager = await this.prisma.staff.findFirst({
        where: {
          id: body.managerStaffId,
          tenantId,
          status: 'ACTIVE',
          branch: { companyId },
          ...this.branchWhere(branchIds),
        },
        select: { id: true },
      });
      if (!manager) throw new BadRequestException('Manager is outside the active organization scope.');
    }

    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('effectiveFrom must be a valid date.');
    }
    const date = effectiveFrom.toISOString().slice(0, 10);

    return this.prisma.$transaction(async (tx) => {
      const history = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,effective_from,effective_to FROM hr_employee_assignments WHERE tenant_id=$1 AND staff_id=$2 ORDER BY effective_from ASC,created_at ASC FOR UPDATE`,
        tenantId,
        staffId,
      );
      if (history.some((item) => String(item.effective_from).slice(0, 10) === date)) {
        throw new BadRequestException('An organization assignment already exists for this effective date.');
      }
      const previous = [...history].reverse().find((item) => String(item.effective_from).slice(0, 10) < date);
      const next = history.find((item) => String(item.effective_from).slice(0, 10) > date);
      if (previous) {
        const previousEnd = previous.effective_to ? String(previous.effective_to).slice(0, 10) : null;
        if (!previousEnd || previousEnd >= date) {
          await tx.$executeRawUnsafe(
            `UPDATE hr_employee_assignments SET effective_to=($1::date-INTERVAL '1 day')::date,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
            date,
            previous.id,
          );
        }
      }
      const effectiveTo = next
        ? new Date(new Date(next.effective_from).getTime() - 86400000).toISOString().slice(0, 10)
        : null;
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_employee_assignments(id,tenant_id,company_id,branch_id,staff_id,department_id,team_id,position_id,manager_staff_id,effective_from,effective_to,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12) RETURNING *`,
        randomUUID(),
        tenantId,
        companyId,
        targetBranchId,
        staffId,
        body.departmentId ?? null,
        body.teamId ?? null,
        body.positionId ?? null,
        body.managerStaffId ?? null,
        date,
        effectiveTo,
        body.reason ?? 'ORGANIZATION_CHANGE',
      );
      if (!next && targetBranchId !== staff.branchId) {
        await tx.staff.update({ where: { id: staffId }, data: { branchId: targetBranchId } });
        await tx.$executeRawUnsafe(
          `UPDATE employee_master_records SET branch_id=$1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$2 AND staff_id=$3`,
          targetBranchId,
          tenantId,
          staffId,
        );
      }
      return rows[0];
    });
  }
}
