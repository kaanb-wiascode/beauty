import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  DEFAULT_EXPENSE_TAXONOMY,
  DEFAULT_INCOME_TAXONOMY,
  type DefaultFinanceCategory,
} from './domain/default-finance-taxonomy';

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
    return this.listCategoryTable('expense_categories');
  }

  async createCategory(input: CreateCategoryInput) {
    return this.createCategoryInTable('expense_categories', input, 'Expense');
  }

  async listIncomeCategories() {
    return this.listCategoryTable('income_categories');
  }

  async createIncomeCategory(input: CreateCategoryInput) {
    return this.createCategoryInTable('income_categories', input, 'Income');
  }

  async bootstrapDefaultTaxonomy() {
    const { tenantId, companyId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        `finance-taxonomy:${tenantId}`,
        companyId,
      );

      const expense = await this.bootstrapCategoryTable(
        tx,
        'expense_categories',
        DEFAULT_EXPENSE_TAXONOMY,
        tenantId,
        companyId,
      );
      const income = await this.bootstrapCategoryTable(
        tx,
        'income_categories',
        DEFAULT_INCOME_TAXONOMY,
        tenantId,
        companyId,
      );

      return {
        expense,
        income,
        idempotent: expense.created === 0 && income.created === 0,
      };
    });
  }

  private async bootstrapCategoryTable(
    tx: Prisma.TransactionClient,
    table: 'expense_categories' | 'income_categories',
    taxonomy: readonly DefaultFinanceCategory[],
    tenantId: string,
    companyId: string,
  ) {
    let created = 0;
    let existing = 0;

    for (const category of taxonomy) {
      const parent = await this.upsertSystemCategory(tx, table, category, tenantId, companyId, null);
      created += parent.created ? 1 : 0;
      existing += parent.created ? 0 : 1;

      for (const child of category.children ?? []) {
        const childResult = await this.upsertSystemCategory(
          tx,
          table,
          child,
          tenantId,
          companyId,
          parent.id,
        );
        created += childResult.created ? 1 : 0;
        existing += childResult.created ? 0 : 1;
      }
    }

    return { created, existing, total: created + existing };
  }

  private async upsertSystemCategory(
    tx: Prisma.TransactionClient,
    table: 'expense_categories' | 'income_categories',
    category: DefaultFinanceCategory,
    tenantId: string,
    companyId: string,
    parentId: string | null,
  ) {
    const current = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${table}
       WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3
       LIMIT 1`,
      tenantId,
      companyId,
      category.code,
    );
    if (current.length) return { id: current[0].id, created: false };

    const id = randomUUID();
    const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO ${table}(
         id,tenant_id,company_id,parent_id,code,name,system,active,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,true,true,CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id,company_id,code) DO NOTHING
       RETURNING id`,
      id,
      tenantId,
      companyId,
      parentId,
      category.code,
      category.name,
    );
    if (inserted.length) return { id: inserted[0].id, created: true };

    const raced = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${table}
       WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3
       LIMIT 1`,
      tenantId,
      companyId,
      category.code,
    );
    if (!raced.length) {
      throw new ConflictException(`Unable to initialize finance category ${category.code}.`);
    }
    return { id: raced[0].id, created: false };
  }

  private async listCategoryTable(table: 'expense_categories' | 'income_categories') {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT id, code, name, parent_id AS "parentId", system, active,
              company_id AS "companyId", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ${table}
       WHERE tenant_id=$1::text AND (company_id IS NULL OR company_id=$2::text)
       ORDER BY parent_id NULLS FIRST, name ASC`,
      tenantId,
      companyId,
    );
  }

  private async createCategoryInTable(
    table: 'expense_categories' | 'income_categories',
    input: CreateCategoryInput,
    label: 'Expense' | 'Income',
  ) {
    const { tenantId, companyId } = this.context();

    if (input.parentId) {
      const parent = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM ${table}
         WHERE id=$1::text AND tenant_id=$2::text
           AND (company_id IS NULL OR company_id=$3::text) AND active=true
         LIMIT 1`,
        input.parentId,
        tenantId,
        companyId,
      );
      if (!parent.length) throw new NotFoundException(`${label} parent category not found`);
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe(
        `INSERT INTO ${table}(
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
      const prismaError = error as { code?: string; meta?: { code?: string } };
      if (prismaError.code === 'P2002' || prismaError.code === '23505' || prismaError.meta?.code === '23505') {
        throw new ConflictException(`${label} category code already exists for this company.`);
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
      const prismaError = error as { code?: string; meta?: { code?: string } };
      if (prismaError.code === 'P2002' || prismaError.code === '23505' || prismaError.meta?.code === '23505') {
        throw new ConflictException('Cost center code already exists for this company.');
      }
      throw error;
    }
  }
}
