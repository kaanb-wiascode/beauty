import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { validateJournalLines } from '../accounting/domain/journal-policy';
import { buildIncomeAccrualJournalLines } from './domain/income-accounting-policy';

interface UpsertIncomeAccountingMappingInput {
  categoryId: string;
  revenueAccountId: string;
  taxAccountId?: string;
  receivableAccountId: string;
}

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

type IncomeApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type IncomeAccountingStatus = 'UNPOSTED' | 'READY_TO_POST' | 'POSTED' | 'REVERSED';

interface IncomeAccountingRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  categoryId: string;
  transactionDate: Date;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  currency: string;
  exchangeRate: Prisma.Decimal;
  description: string | null;
  approvalStatus: IncomeApprovalStatus;
  accountingStatus: IncomeAccountingStatus;
  version: number;
}

interface MappingRow {
  id: string;
  categoryId: string;
  revenueAccountId: string;
  taxAccountId: string | null;
  receivableAccountId: string;
  active: boolean;
}

@Injectable()
export class IncomeAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private async acquireLock(tx: Prisma.TransactionClient, namespace: string, key: string) {
    await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
      `WITH income_accounting_lock AS (
         SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
       )
       SELECT TRUE AS locked
       FROM income_accounting_lock`,
      namespace,
      key,
    );
  }

  private async validateAccount(accountId: string, allowedTypes: readonly AccountType[], label: string) {
    const { tenantId, companyId } = this.context();
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, tenantId, companyId, active: true },
      select: { id: true, type: true },
    });
    if (!account || !allowedTypes.includes(account.type)) {
      throw new BadRequestException(`${label} is invalid, inactive or has an incompatible account type.`);
    }
  }

  async listMappings() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT m.id,m.category_id AS "categoryId",c.code AS "categoryCode",c.name AS "categoryName",
              m.revenue_account_id AS "revenueAccountId",ra.code AS "revenueAccountCode",ra.name AS "revenueAccountName",
              m.tax_account_id AS "taxAccountId",ta.code AS "taxAccountCode",ta.name AS "taxAccountName",
              m.receivable_account_id AS "receivableAccountId",rc.code AS "receivableAccountCode",rc.name AS "receivableAccountName",
              m.active,m.created_at AS "createdAt",m.updated_at AS "updatedAt"
       FROM income_accounting_mappings m
       JOIN income_categories c ON c.id=m.category_id
       JOIN chart_of_accounts ra ON ra.id=m.revenue_account_id
       LEFT JOIN chart_of_accounts ta ON ta.id=m.tax_account_id
       JOIN chart_of_accounts rc ON rc.id=m.receivable_account_id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text
       ORDER BY c.name ASC`,
      tenantId,
      companyId,
    );
  }

  async upsertMapping(input: UpsertIncomeAccountingMappingInput) {
    const { tenantId, companyId } = this.context();
    const category = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM income_categories
       WHERE id=$1::text AND tenant_id=$2::text
         AND (company_id IS NULL OR company_id=$3::text) AND active=true
       LIMIT 1`,
      input.categoryId,
      tenantId,
      companyId,
    );
    if (!category.length) throw new NotFoundException('Income category not found');

    await this.validateAccount(input.revenueAccountId, ['REVENUE'], 'Revenue account');
    await this.validateAccount(input.receivableAccountId, ['ASSET'], 'Receivable account');
    if (input.taxAccountId) {
      await this.validateAccount(input.taxAccountId, ['LIABILITY'], 'Tax account');
    }

    const rows = await this.prisma.$queryRawUnsafe(
      `INSERT INTO income_accounting_mappings(
         id,tenant_id,company_id,category_id,revenue_account_id,tax_account_id,receivable_account_id,active,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,true,CURRENT_TIMESTAMP)
       ON CONFLICT (company_id,category_id) DO UPDATE SET
         revenue_account_id=EXCLUDED.revenue_account_id,
         tax_account_id=EXCLUDED.tax_account_id,
         receivable_account_id=EXCLUDED.receivable_account_id,
         active=true,
         updated_at=CURRENT_TIMESTAMP
       RETURNING id,category_id AS "categoryId",revenue_account_id AS "revenueAccountId",
                 tax_account_id AS "taxAccountId",receivable_account_id AS "receivableAccountId",active,
                 created_at AS "createdAt",updated_at AS "updatedAt"`,
      randomUUID(),
      tenantId,
      companyId,
      input.categoryId,
      input.revenueAccountId,
      input.taxAccountId ?? null,
      input.receivableAccountId,
    );
    return (rows as unknown[])[0];
  }

  async prepare(incomeId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const income = await this.getIncomeForUpdate(tx, incomeId);
      const mapping = await this.getMapping(tx, income.categoryId);
      if (income.approvalStatus !== 'APPROVED') {
        throw new BadRequestException('Only approved income records can become ready to post.');
      }
      if (income.accountingStatus !== 'UNPOSTED') {
        throw new BadRequestException(`Income cannot become ready to post from ${income.accountingStatus}.`);
      }
      if (!mapping) throw new BadRequestException('Income category requires an accounting mapping before posting.');
      this.assertPostingAmounts(income, mapping);

      await tx.$executeRawUnsafe(
        `UPDATE income_records SET accounting_status='READY_TO_POST',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
        income.id,
      );
      await this.audit(tx, income, actorId, 'INCOME_ACCOUNTING_READY', income.accountingStatus, 'READY_TO_POST');
      return { id: income.id, accountingStatus: 'READY_TO_POST', version: income.version + 1 };
    });
  }

  async post(incomeId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const income = await this.getIncomeForUpdate(tx, incomeId);
      const mapping = await this.getMapping(tx, income.categoryId);
      if (!mapping) throw new BadRequestException('Income category requires an accounting mapping before posting.');

      if (income.accountingStatus === 'POSTED') {
        const existing = await tx.journalEntry.findFirst({
          where: { companyId: income.companyId, referenceType: 'INCOME', referenceId: income.id },
          select: { id: true },
        });
        return { id: income.id, accountingStatus: 'POSTED', journalEntryId: existing?.id ?? null, idempotent: true };
      }
      if (income.approvalStatus !== 'APPROVED') {
        throw new BadRequestException('Only approved income records can be posted.');
      }
      if (!['UNPOSTED', 'READY_TO_POST'].includes(income.accountingStatus)) {
        throw new BadRequestException(`Income cannot be posted from ${income.accountingStatus}.`);
      }

      this.assertPostingAmounts(income, mapping);
      await this.acquireLock(tx, `income-post:${income.companyId}`, income.id);
      const existing = await tx.journalEntry.findFirst({
        where: { companyId: income.companyId, referenceType: 'INCOME', referenceId: income.id },
        select: { id: true },
      });
      if (existing) {
        await tx.$executeRawUnsafe(
          `UPDATE income_records SET accounting_status='POSTED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
          income.id,
        );
        return { id: income.id, accountingStatus: 'POSTED', journalEntryId: existing.id, idempotent: true };
      }

      const lines = buildIncomeAccrualJournalLines(
        {
          grossAmount: Number(income.grossAmount),
          netAmount: Number(income.netAmount),
          taxAmount: Number(income.taxAmount),
        },
        mapping,
      );
      try {
        validateJournalLines(lines);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Income journal is not balanced.');
      }

      const journal = await tx.journalEntry.create({
        data: {
          tenantId: income.tenantId,
          companyId: income.companyId,
          branchId: income.branchId,
          number: `JE-${income.transactionDate.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: income.transactionDate,
          description: income.description?.trim() || `Gelir kaydı ${income.id}`,
          referenceType: 'INCOME',
          referenceId: income.id,
          postedAt: new Date(),
          lines: { create: lines },
        },
        select: { id: true },
      });

      await tx.$executeRawUnsafe(
        `UPDATE income_records SET accounting_status='POSTED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
        income.id,
      );
      await this.audit(tx, income, actorId, 'INCOME_POSTED', income.accountingStatus, 'POSTED');
      return { id: income.id, accountingStatus: 'POSTED', journalEntryId: journal.id, version: income.version + 1 };
    });
  }

  private async getIncomeForUpdate(tx: Prisma.TransactionClient, id: string): Promise<IncomeAccountingRow> {
    const { tenantId, companyId, branchId } = this.context();
    await this.acquireLock(tx, `income:${companyId}`, id);
    const rows = await tx.$queryRawUnsafe<IncomeAccountingRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",category_id AS "categoryId",
              transaction_date AS "transactionDate",gross_amount AS "grossAmount",net_amount AS "netAmount",tax_amount AS "taxAmount",
              currency,exchange_rate AS "exchangeRate",description,approval_status AS "approvalStatus",
              accounting_status AS "accountingStatus",version
       FROM income_records
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Income record not found');
    return rows[0];
  }

  private async getMapping(tx: Prisma.TransactionClient, categoryId: string): Promise<MappingRow | null> {
    const { tenantId, companyId } = this.context();
    const rows = await tx.$queryRawUnsafe<MappingRow[]>(
      `SELECT id,category_id AS "categoryId",revenue_account_id AS "revenueAccountId",tax_account_id AS "taxAccountId",
              receivable_account_id AS "receivableAccountId",active
       FROM income_accounting_mappings
       WHERE tenant_id=$1::text AND company_id=$2::text AND category_id=$3::text AND active=true
       LIMIT 1`,
      tenantId,
      companyId,
      categoryId,
    );
    return rows[0] ?? null;
  }

  private assertPostingAmounts(income: IncomeAccountingRow, mapping: MappingRow) {
    if (income.currency !== 'TRY' && Number(income.exchangeRate) <= 0) {
      throw new BadRequestException('A positive exchange rate is required for foreign-currency income.');
    }
    try {
      buildIncomeAccrualJournalLines(
        {
          grossAmount: Number(income.grossAmount),
          netAmount: Number(income.netAmount),
          taxAmount: Number(income.taxAmount),
        },
        mapping,
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    income: IncomeAccountingRow,
    actorId: string,
    eventType: string,
    beforeStatus: string,
    afterStatus: string,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO income_audit_events(
         id,tenant_id,company_id,branch_id,income_record_id,actor_id,event_type,before_state,after_state
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8::jsonb,$9::jsonb)`,
      randomUUID(),
      income.tenantId,
      income.companyId,
      income.branchId,
      income.id,
      actorId,
      eventType,
      JSON.stringify({ accountingStatus: beforeStatus }),
      JSON.stringify({ accountingStatus: afterStatus }),
    );
  }
}
