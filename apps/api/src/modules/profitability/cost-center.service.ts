import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface CreateCostCenterInput {
  code: string;
  name: string;
}

interface SetAllocationsInput {
  allocations: Array<{ branchId: string; percent: number }>;
}

@Injectable()
export class CostCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
    };
  }

  async create(input: CreateCostCenterInput) {
    const { tenantId, companyId } = this.context();
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || !name) throw new BadRequestException('Cost center code and name are required.');

    try {
      const id = randomUUID();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO cost_centers(id,tenant_id,company_id,code,name)
         VALUES($1::text,$2::text,$3::text,$4,$5)`,
        id,
        tenantId,
        companyId,
        code,
        name,
      );
      return { id, code, name, active: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
        throw new BadRequestException('A cost center with this code already exists.');
      }
      throw error;
    }
  }

  async list() {
    const { companyId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT cc.id,cc.code,cc.name,cc.active,
              COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
                'branchId',cba.branch_id,'branchName',b.name,'percent',cba.percent
              ) ORDER BY b.name) FILTER (WHERE cba.branch_id IS NOT NULL),'[]'::json) AS allocations
       FROM cost_centers cc
       LEFT JOIN cost_center_branch_allocations cba ON cba.cost_center_id=cc.id
       LEFT JOIN branches b ON b.id=cba.branch_id
       WHERE cc.company_id=$1::text
       GROUP BY cc.id
       ORDER BY cc.code`,
      companyId,
    );
  }

  async setAllocations(costCenterId: string, input: SetAllocationsInput) {
    const { companyId } = this.context();
    if (!input.allocations.length) throw new BadRequestException('At least one allocation is required.');
    if (new Set(input.allocations.map((item) => item.branchId)).size !== input.allocations.length) {
      throw new BadRequestException('Each branch can only appear once.');
    }

    const normalized = input.allocations.map((item) => ({
      branchId: item.branchId,
      percent: Math.round((Number(item.percent) + Number.EPSILON) * 10000) / 10000,
    }));
    if (normalized.some((item) => !Number.isFinite(item.percent) || item.percent <= 0 || item.percent > 100)) {
      throw new BadRequestException('Allocation percentages must be greater than 0 and no more than 100.');
    }
    const total = Math.round((normalized.reduce((sum, item) => sum + item.percent, 0) + Number.EPSILON) * 10000) / 10000;
    if (Math.abs(total - 100) > 0.0001) {
      throw new BadRequestException(`Allocation percentages must total 100. Current total: ${total}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const centers = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM cost_centers WHERE id=$1::text AND company_id=$2::text AND active=true LIMIT 1 FOR UPDATE`,
        costCenterId,
        companyId,
      );
      if (!centers.length) throw new NotFoundException('Cost center not found');

      const branchIds = normalized.map((item) => item.branchId);
      const branches = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM branches WHERE "companyId"=$1::text AND id=ANY($2::text[])`,
        companyId,
        branchIds,
      );
      if (branches.length !== branchIds.length) {
        throw new BadRequestException('One or more allocation branches are invalid.');
      }

      await tx.$executeRawUnsafe(
        `DELETE FROM cost_center_branch_allocations WHERE cost_center_id=$1::text`,
        costCenterId,
      );
      for (const item of normalized) {
        await tx.$executeRawUnsafe(
          `INSERT INTO cost_center_branch_allocations(cost_center_id,branch_id,percent)
           VALUES($1::text,$2::text,$3)`,
          costCenterId,
          item.branchId,
          item.percent,
        );
      }

      return { costCenterId, totalPercent: total, allocations: normalized };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assignExpenseLine(journalEntryLineId: string, costCenterId: string) {
    const { companyId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const centers = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM cost_centers WHERE id=$1::text AND company_id=$2::text AND active=true LIMIT 1`,
        costCenterId,
        companyId,
      );
      if (!centers.length) throw new NotFoundException('Cost center not found');

      const lines = await tx.$queryRawUnsafe<any[]>(
        `SELECT jel.id,je."branchId",coa.type,coa.code
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
         JOIN chart_of_accounts coa ON coa.id=jel."accountId"
         WHERE jel.id=$1::text AND je."companyId"=$2::text
         LIMIT 1`,
        journalEntryLineId,
        companyId,
      );
      if (!lines.length) throw new NotFoundException('Posted journal expense line not found');
      const line = lines[0];
      if (line.type !== 'EXPENSE') {
        throw new BadRequestException('Only expense account lines can be assigned to a cost center.');
      }
      if (line.branchId) {
        throw new BadRequestException('Only company-level expense lines without a branch can be allocated through a cost center.');
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO cost_center_expense_links(journal_entry_line_id,cost_center_id)
         VALUES($1::text,$2::text)
         ON CONFLICT(journal_entry_line_id)
         DO UPDATE SET cost_center_id=EXCLUDED.cost_center_id`,
        journalEntryLineId,
        costCenterId,
      );
      return { journalEntryLineId, costCenterId, accountCode: line.code };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
