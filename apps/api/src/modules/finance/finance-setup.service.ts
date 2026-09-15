import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface CreateCategoryInput {
  code: string;
  name: string;
  parentId?: string;
}

interface CreateCostCenterInput {
  code: string;
  name: string;
}

@Injectable()
export class FinanceSetupService {
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

  async listCategories() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT id, code, name, parent_id AS "parentId", system, active,
              company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM expense_categories
       WHERE tenant_id=$1::text AND (company_id IS NULL OR company_id=$2::text)
       ORDER BY parent_id NULLS FIRST, name ASC`,
      tenantId,
      companyId,
    );
  }

  async createCategory(input: CreateCategoryInput) {
    const { tenantId, companyId } = this.context();

    if (input.parentId) {
      const parent = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM expense_categories
         WHERE id=$1::text AND tenant_id=$2::text
           AND (company_id IS NULL OR company_id=$3::text) AND active=true
         LIMIT 1`,
        input.parentId,
        tenantId,
        companyId,
      );
      if (!parent.length) throw new NotFoundException('Parent expense category not found');
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe(
        `INSERT INTO expense_categories(
           id,tenant_id,company_id,parent_id,code,name,system,active,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,false,true,CURRENT_TIMESTAMP)
         RETURNING id,code,name,parent_id AS "parentId",system,active,
                   company_id AS "companyId",created_at AS "createdAt",updated_at AS "updatedAt"`,
        randomUUID(),
        tenantId,
        companyId,
        input.parentId ?? null,
        input.code,
        input.name,
      );
      return (rows as unknown[])[0];
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' || (error as { code?: string }).code === '23505') {
        throw new ConflictException('Expense category code already exists for this company.');
      }
      throw error;
    }
  }

  async listCostCenters() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT id,code,name,active,company_id AS "companyId",
              created_at AS "createdAt",updated_at AS "updatedAt"
       FROM finance_cost_centers
       WHERE tenant_id=$1::text AND company_id=$2::text
       ORDER BY name ASC`,
      tenantId,
      companyId,
    );
  }

  async createCostCenter(input: CreateCostCenterInput) {
    const { tenantId, companyId } = this.context();
    try {
      const rows = await this.prisma.$queryRawUnsafe(
        `INSERT INTO finance_cost_centers(
           id,tenant_id,company_id,code,name,active,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4,$5,true,CURRENT_TIMESTAMP)
         RETURNING id,code,name,active,company_id AS "companyId",
                   created_at AS "createdAt",updated_at AS "updatedAt"`,
        randomUUID(),
        tenantId,
        companyId,
        input.code,
        input.name,
      );
      return (rows as unknown[])[0];
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' || (error as { code?: string }).code === '23505') {
        throw new ConflictException('Cost center code already exists for this company.');
      }
      throw error;
    }
  }
}
