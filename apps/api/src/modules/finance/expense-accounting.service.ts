import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { validateJournalLines } from '../accounting/domain/journal-policy';
import { assertExpenseAccountingTransition } from './domain/expense-policy';

interface UpsertExpenseAccountingMappingInput {
  categoryId: string;
  expenseAccountId: string;
  taxAccountId?: string;
  payableAccountId: string;
}

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

interface ExpenseAccountingRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  categoryId: string;
  transactionDate: Date;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  withholdingAmount: Prisma.Decimal;
  currency: string;
  exchangeRate: Prisma.Decimal;
  description: string | null;
  counterpartyName: string | null;
  approvalStatus: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  accountingStatus: 'UNPOSTED' | 'READY_TO_POST' | 'POSTED' | 'REVERSED';
  version: number;
}

interface MappingRow {
  id: string;
  categoryId: string;
  expenseAccountId: string;
  taxAccountId: string | null;
  payableAccountId: string | null;
  active: boolean;
}

@Injectable()
export class ExpenseAccountingService {
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
    await tx.$queryRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      namespace,
      key,
    );
  }

  private async validateAccount(
    accountId: string,
    allowedTypes: readonly AccountType[],
    label: string,
  ) {
    const { tenantId, companyId } = this.context();
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, tenantId, companyId, active: true },
      select: { id: true, type: true },
    });
    if (!account || !allowedTypes.includes(account.type)) {
      throw new BadRequestException(`${label} is invalid, inactive or has an incompatible account type.`);
    }
    return account;
  }

  async listMappings() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT m.id,m.category_id AS "categoryId",c.code AS "categoryCode",c.name AS "categoryName",
              m.expense_account_id AS "expenseAccountId",ea.code AS "expenseAccountCode",ea.name AS "expenseAccountName",
              m.tax_account_id AS "taxAccountId",ta.code AS "taxAccountCode",ta.name AS "taxAccountName",
              m.payable_account_id AS "payableAccountId",pa.code AS "payableAccountCode",pa.name AS "payableAccountName",
              m.active,m.created_at AS "createdAt",m.updated_at AS "updatedAt"
       FROM expense_accounting_mappings m
       JOIN expense_categories c ON c.id=m.category_id
       JOIN chart_of_accounts ea ON ea.id=m.expense_account_id
       LEFT JOIN chart_of_accounts ta ON ta.id=m.tax_account_id
       LEFT JOIN chart_of_accounts pa ON pa.id=m.payable_account_id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text
       ORDER BY c.name ASC`,
      tenantId,
      companyId,
    );
  }

  async upsertMapping(input: UpsertExpenseAccountingMappingInput) {
    const { tenantId, companyId } = this.context();
    const category = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expense_categories
       WHERE id=$1::text AND tenant_id=$2::text
         AND (company_id IS NULL OR company_id=$3::text) AND active=true
       LIMIT 1`,
      input.categoryId,
      tenantId,
      companyId,
    );
    if (!category.length) throw new NotFoundException('Expense category not found');

    await this.validateAccount(input.expenseAccountId, ['EXPENSE'], 'Expense account');
    await this.validateAccount(input.payableAccountId, ['LIABILITY'], 'Payable account');
    if (input.taxAccountId) await this.validateAccount(input.taxAccountId, ['ASSET', 'LIABILITY'], 'Tax account');

    const rows = await this.prisma.$queryRawUnsafe(
      `INSERT INTO expense_accounting_mappings(
         id,tenant_id,company_id,category_id,expense_account_id,tax_account_id,payable_account_id,active,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,true,CURRENT_TIMESTAMP)
       ON CONFLICT (company_id,category_id) DO UPDATE SET
         expense_account_id=EXCLUDED.expense_account_id,
         tax_account_id=EXCLUDED.tax_account_id,
         payable_account_id=EXCLUDED.payable_account_id,
         active=true,
         updated_at=CURRENT_TIMESTAMP
       RETURNING id,category_id AS "categoryId",expense_account_id AS "expenseAccountId",
                 tax_account_id AS "taxAccountId",payable_account_id AS "payableAccountId",active,
                 created_at AS "createdAt",updated_at AS "updatedAt"`,
      randomUUID(),
      tenantId,
      companyId,
      input.categoryId,
      input.expenseAccountId,
      input.taxAccountId ?? null,
      input.payableAccountId,
    );
    return (rows as unknown[])[0];
  }

  async prepare(expenseId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await this.getExpenseForUpdate(tx, expenseId);
      const mapping = await this.getMapping(tx, expense.categoryId);
      try {
        assertExpenseAccountingTransition({
          approvalStatus: expense.approvalStatus,
          current: expense.accountingStatus,
          next: 'READY_TO_POST',
          hasAccountingMapping: Boolean(mapping),
        });
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
      this.assertPostingAmounts(expense, mapping);

      await tx.$executeRawUnsafe(
        `UPDATE expenses SET accounting_status='READY_TO_POST',version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1::text`,
        expense.id,
      );
      await this.audit(tx, expense, actorId, 'EXPENSE_ACCOUNTING_READY', expense.accountingStatus, 'READY_TO_POST');
      return { id: expense.id, accountingStatus: 'READY_TO_POST', version: expense.version + 1 };
    });
  }

  async post(expenseId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await this.getExpenseForUpdate(tx, expenseId);
      const mapping = await this.getMapping(tx, expense.categoryId);
      if (!mapping) throw new BadRequestException('Expense category requires an accounting mapping before posting.');

      if (expense.accountingStatus === 'POSTED') {
        const existing = await tx.journalEntry.findFirst({
          where: { companyId: expense.companyId, referenceType: 'EXPENSE', referenceId: expense.id },
          select: { id: true },
        });
        return { id: expense.id, accountingStatus: 'POSTED', journalEntryId: existing?.id ?? null, idempotent: true };
      }

      if (expense.accountingStatus === 'UNPOSTED') {
        try {
          assertExpenseAccountingTransition({
            approvalStatus: expense.approvalStatus,
            current: 'UNPOSTED',
            next: 'READY_TO_POST',
            hasAccountingMapping: true,
          });
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
      } else if (expense.accountingStatus !== 'READY_TO_POST') {
        throw new BadRequestException(`Expense cannot be posted from ${expense.accountingStatus}.`);
      }

      this.assertPostingAmounts(expense, mapping);
      await this.acquireLock(tx, `expense-post:${expense.companyId}`, expense.id);

      const existing = await tx.journalEntry.findFirst({
        where: { companyId: expense.companyId, referenceType: 'EXPENSE', referenceId: expense.id },
        select: { id: true },
      });
      if (existing) {
        await tx.$executeRawUnsafe(
          `UPDATE expenses SET accounting_status='POSTED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
          expense.id,
        );
        return { id: expense.id, accountingStatus: 'POSTED', journalEntryId: existing.id, idempotent: true };
      }

      const net = Number(expense.netAmount);
      const tax = Number(expense.taxAmount);
      const gross = Number(expense.grossAmount);
      const lines = [
        { accountId: mapping.expenseAccountId, debit: net, credit: 0, memo: 'Gider tahakkuku' },
        ...(tax > 0 && mapping.taxAccountId
          ? [{ accountId: mapping.taxAccountId, debit: tax, credit: 0, memo: 'Vergi' }]
          : []),
        { accountId: mapping.payableAccountId!, debit: 0, credit: gross, memo: 'Gider borcu' },
      ];
      try {
        validateJournalLines(lines);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expense journal is not balanced.');
      }

      const journal = await tx.journalEntry.create({
        data: {
          tenantId: expense.tenantId,
          companyId: expense.companyId,
          branchId: expense.branchId,
          number: `JE-${expense.transactionDate.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: expense.transactionDate,
          description: expense.description?.trim() || `Gider kaydı ${expense.id}`,
          referenceType: 'EXPENSE',
          referenceId: expense.id,
          postedAt: new Date(),
          lines: { create: lines },
        },
        select: { id: true },
      });

      await tx.$executeRawUnsafe(
        `UPDATE expenses SET accounting_status='POSTED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
        expense.id,
      );
      await this.audit(tx, expense, actorId, 'EXPENSE_POSTED', expense.accountingStatus, 'POSTED');
      return { id: expense.id, accountingStatus: 'POSTED', journalEntryId: journal.id, version: expense.version + 1 };
    });
  }

  private async getExpenseForUpdate(tx: Prisma.TransactionClient, id: string): Promise<ExpenseAccountingRow> {
    const { tenantId, companyId, branchId } = this.context();
    await this.acquireLock(tx, `expense:${companyId}`, id);
    const rows = await tx.$queryRawUnsafe<ExpenseAccountingRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",category_id AS "categoryId",
              transaction_date AS "transactionDate",gross_amount AS "grossAmount",net_amount AS "netAmount",
              tax_amount AS "taxAmount",withholding_amount AS "withholdingAmount",currency,exchange_rate AS "exchangeRate",
              description,counterparty_name AS "counterpartyName",approval_status AS "approvalStatus",
              accounting_status AS "accountingStatus",version
       FROM expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Expense not found');
    return rows[0];
  }

  private async getMapping(tx: Prisma.TransactionClient, categoryId: string): Promise<MappingRow | null> {
    const { tenantId, companyId } = this.context();
    const rows = await tx.$queryRawUnsafe<MappingRow[]>(
      `SELECT id,category_id AS "categoryId",expense_account_id AS "expenseAccountId",tax_account_id AS "taxAccountId",
              payable_account_id AS "payableAccountId",active
       FROM expense_accounting_mappings
       WHERE tenant_id=$1::text AND company_id=$2::text AND category_id=$3::text AND active=true
       LIMIT 1`,
      tenantId,
      companyId,
      categoryId,
    );
    return rows[0] ?? null;
  }

  private assertPostingAmounts(expense: ExpenseAccountingRow, mapping: MappingRow | null) {
    if (!mapping?.payableAccountId) throw new BadRequestException('Payable account mapping is required.');
    const gross = Number(expense.grossAmount);
    const net = Number(expense.netAmount);
    const tax = Number(expense.taxAmount);
    const withholding = Number(expense.withholdingAmount);
    if (expense.currency !== 'TRY' && Number(expense.exchangeRate) <= 0) {
      throw new BadRequestException('A positive exchange rate is required for foreign-currency expenses.');
    }
    if (withholding > 0) {
      throw new BadRequestException('Withholding posting requires a dedicated withholding account mapping before accounting can continue.');
    }
    if (tax > 0 && !mapping.taxAccountId) {
      throw new BadRequestException('Tax account mapping is required when tax amount is greater than zero.');
    }
    if (Math.abs(net + tax - gross) > 0.01) {
      throw new BadRequestException('Expense accounting requires net amount plus tax amount to equal gross amount.');
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    expense: ExpenseAccountingRow,
    actorId: string,
    eventType: string,
    beforeStatus: string,
    afterStatus: string,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,before_state,after_state
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8::jsonb,$9::jsonb)`,
      randomUUID(),
      expense.tenantId,
      expense.companyId,
      expense.branchId,
      expense.id,
      actorId,
      eventType,
      JSON.stringify({ accountingStatus: beforeStatus }),
      JSON.stringify({ accountingStatus: afterStatus }),
    );
  }
}
