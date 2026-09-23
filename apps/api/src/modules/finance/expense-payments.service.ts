import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { validateJournalLines } from '../accounting/domain/journal-policy';
import {
  assertExpensePaymentAllowed,
  buildExpensePaymentLines,
  buildExpensePaymentReversalLines,
  expensePayableAmount,
  expensePaymentStatus,
} from './domain/expense-payment-policy';

interface RecordExpensePaymentInput {
  amount: number;
  paymentAccountId: string;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';
  reference?: string;
  note?: string;
  paidAt?: Date;
  sourceType?: string;
  sourceId?: string;
}

interface ReverseExpensePaymentInput {
  reason: string;
  sourceType?: string;
  sourceId?: string;
}

interface ExpensePaymentContextRow {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  categoryId: string;
  grossAmount: Prisma.Decimal;
  withholdingAmount: Prisma.Decimal;
  approvalStatus: string;
  accountingStatus: string;
  paymentStatus: string;
}

interface ReversibleExpensePaymentRow {
  id: string;
  expenseId: string;
  payableAccountId: string;
  paymentAccountId: string;
  journalEntryId: string;
  amount: Prisma.Decimal;
  paidAt: Date;
  reversalId: string | null;
}

@Injectable()
export class ExpensePaymentsService {
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
      `WITH expense_payment_lock AS (
         SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
       )
       SELECT TRUE AS locked
       FROM expense_payment_lock`,
      namespace,
      key,
    );
  }

  private validateSourcePair(sourceType?: string, sourceId?: string) {
    if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
      throw new BadRequestException('Payment source type and source id must be provided together.');
    }
  }

  async list(expenseId: string) {
    const { tenantId, companyId, branchId } = this.context();
    await this.assertExpenseVisible(expenseId);
    return this.prisma.$queryRawUnsafe(
      `SELECT p.id,p.expense_id AS "expenseId",p.payable_account_id AS "payableAccountId",
              pa.code AS "payableAccountCode",pa.name AS "payableAccountName",
              p.payment_account_id AS "paymentAccountId",ca.code AS "paymentAccountCode",ca.name AS "paymentAccountName",
              p.journal_entry_id AS "journalEntryId",p.amount,p.method,p.reference,p.note,p.paid_at AS "paidAt",
              p.source_type AS "sourceType",p.source_id AS "sourceId",p.created_by AS "createdBy",p.created_at AS "createdAt",
              r.id AS "reversalId",r.reason AS "reversalReason",r.created_by AS "reversedBy",r.created_at AS "reversedAt",
              r.journal_entry_id AS "reversalJournalEntryId"
       FROM expense_payments p
       JOIN chart_of_accounts pa ON pa.id=p.payable_account_id
       JOIN chart_of_accounts ca ON ca.id=p.payment_account_id
       LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
       WHERE p.expense_id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
         AND ($4::text IS NULL OR p.branch_id=$4::text)
       ORDER BY p.paid_at DESC,p.created_at DESC`,
      expenseId,
      tenantId,
      companyId,
      branchId,
    );
  }

  async record(expenseId: string, input: RecordExpensePaymentInput, actorId: string) {
    this.validateSourcePair(input.sourceType, input.sourceId);
    const { tenantId, companyId } = this.context();

    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, `expense-payment:${companyId}`, expenseId);
      const expense = await this.getExpenseForUpdate(tx, expenseId);

      if (input.sourceType && input.sourceId) {
        await this.acquireLock(tx, `expense-payment-source:${companyId}`, `${input.sourceType}:${input.sourceId}`);
        const existing = await tx.$queryRawUnsafe<Array<{
          id: string;
          expenseId: string;
          amount: Prisma.Decimal;
          journalEntryId: string;
        }>>(
          `SELECT id,expense_id AS "expenseId",amount,journal_entry_id AS "journalEntryId"
           FROM expense_payments
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4 LIMIT 1`,
          tenantId,
          companyId,
          input.sourceType,
          input.sourceId,
        );
        if (existing.length) {
          if (existing[0].expenseId !== expenseId) {
            throw new BadRequestException('Payment source already belongs to another expense.');
          }
          return {
            id: existing[0].id,
            amount: Number(existing[0].amount),
            journalEntryId: existing[0].journalEntryId,
            paymentStatus: expense.paymentStatus,
            idempotent: true,
          };
        }
      }

      const paymentAccount = await tx.chartOfAccount.findFirst({
        where: {
          id: input.paymentAccountId,
          tenantId,
          companyId,
          active: true,
          type: 'ASSET',
        },
        select: { id: true },
      });
      if (!paymentAccount) {
        throw new BadRequestException('Payment account must be an active asset account in the current company.');
      }

      const mappingRows = await tx.$queryRawUnsafe<Array<{ payableAccountId: string | null }>>(
        `SELECT payable_account_id AS "payableAccountId"
         FROM expense_accounting_mappings
         WHERE tenant_id=$1::text AND company_id=$2::text AND category_id=$3::text AND active=true LIMIT 1`,
        tenantId,
        companyId,
        expense.categoryId,
      );
      const payableAccountId = mappingRows[0]?.payableAccountId;
      if (!payableAccountId) {
        throw new BadRequestException('Expense payable account mapping is required before payment can be recorded.');
      }

      const totals = await this.activePaymentTotal(tx, expense.id, tenantId, companyId);
      const paidAmount = Number(totals);
      const payableAmount = expensePayableAmount(
        Number(expense.grossAmount),
        Number(expense.withholdingAmount),
      );
      try {
        assertExpensePaymentAllowed({
          approvalStatus: expense.approvalStatus,
          accountingStatus: expense.accountingStatus,
          activePaidAmount: paidAmount,
          payableAmount,
          amount: input.amount,
        });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expense payment is not allowed.');
      }

      const lines = buildExpensePaymentLines({
        payableAccountId,
        paymentAccountId: paymentAccount.id,
        amount: input.amount,
      });
      try {
        validateJournalLines(lines);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expense payment journal is not balanced.');
      }

      const paymentId = randomUUID();
      const paidAt = input.paidAt ?? new Date();
      const journal = await tx.journalEntry.create({
        data: {
          tenantId: expense.tenantId,
          companyId: expense.companyId,
          branchId: expense.branchId,
          number: `JE-${paidAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: paidAt,
          description: `Gider ödemesi ${expense.id}`,
          referenceType: 'EXPENSE_PAYMENT',
          referenceId: paymentId,
          postedAt: new Date(),
          lines: { create: lines },
        },
        select: { id: true },
      });

      const rows = await tx.$queryRawUnsafe<Array<{ id: string; amount: Prisma.Decimal; paidAt: Date }>>(
        `INSERT INTO expense_payments(
           id,tenant_id,company_id,branch_id,expense_id,payable_account_id,payment_account_id,journal_entry_id,
           amount,method,reference,note,paid_at,source_type,source_id,created_by
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9,$10,$11,$12,$13,$14,$15,$16::text)
         RETURNING id,amount,paid_at AS "paidAt"`,
        paymentId,
        expense.tenantId,
        expense.companyId,
        expense.branchId,
        expense.id,
        payableAccountId,
        paymentAccount.id,
        journal.id,
        input.amount,
        input.method,
        input.reference?.trim() || null,
        input.note?.trim() || null,
        paidAt,
        input.sourceType ?? null,
        input.sourceId ?? null,
        actorId,
      );

      const newPaidAmount = Math.round((paidAmount + input.amount + Number.EPSILON) * 100) / 100;
      const paymentStatus = expensePaymentStatus(newPaidAmount, payableAmount);
      await tx.$executeRawUnsafe(
        `UPDATE expenses
         SET payment_status=$1::"FinancePaymentStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2::text`,
        paymentStatus,
        expense.id,
      );
      await this.audit(tx, expense, actorId, 'EXPENSE_PAYMENT_RECORDED', {
        before: { paymentStatus: expense.paymentStatus, paidAmount },
        after: { paymentStatus, paidAmount: newPaidAmount, payableAmount, paymentId },
      });

      return {
        id: rows[0].id,
        amount: Number(rows[0].amount),
        paidAt: rows[0].paidAt,
        paymentStatus,
        paidAmount: newPaidAmount,
        payableAmount,
        remainingAmount: Math.max(0, payableAmount - newPaidAmount),
        journalEntryId: journal.id,
      };
    });
  }

  async reverse(expenseId: string, paymentId: string, input: ReverseExpensePaymentInput, actorId: string) {
    this.validateSourcePair(input.sourceType, input.sourceId);
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Payment reversal reason is required.');

    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, `expense-payment:${companyId}`, expenseId);
      await this.acquireLock(tx, `expense-payment-reversal:${companyId}`, paymentId);
      const expense = await this.getExpenseForUpdate(tx, expenseId);
      if (expense.accountingStatus !== 'POSTED') {
        throw new BadRequestException('Expense accounting must remain posted before a payment can be reversed.');
      }

      if (input.sourceType && input.sourceId) {
        await this.acquireLock(tx, `expense-payment-reversal-source:${companyId}`, `${input.sourceType}:${input.sourceId}`);
        const existingBySource = await tx.$queryRawUnsafe<Array<{
          id: string;
          expensePaymentId: string;
          journalEntryId: string;
        }>>(
          `SELECT id,expense_payment_id AS "expensePaymentId",journal_entry_id AS "journalEntryId"
           FROM expense_payment_reversals
           WHERE tenant_id=$1::text AND company_id=$2::text AND source_type=$3 AND source_id=$4 LIMIT 1`,
          tenantId,
          companyId,
          input.sourceType,
          input.sourceId,
        );
        if (existingBySource.length) {
          if (existingBySource[0].expensePaymentId !== paymentId) {
            throw new BadRequestException('Reversal source already belongs to another expense payment.');
          }
          return { ...existingBySource[0], idempotent: true };
        }
      }

      const paymentRows = await tx.$queryRawUnsafe<ReversibleExpensePaymentRow[]>(
        `SELECT p.id,p.expense_id AS "expenseId",p.payable_account_id AS "payableAccountId",
                p.payment_account_id AS "paymentAccountId",p.journal_entry_id AS "journalEntryId",
                p.amount,p.paid_at AS "paidAt",r.id AS "reversalId"
         FROM expense_payments p
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
         WHERE p.id=$1::text AND p.expense_id=$2::text AND p.tenant_id=$3::text AND p.company_id=$4::text
           AND ($5::text IS NULL OR p.branch_id=$5::text) LIMIT 1`,
        paymentId,
        expenseId,
        tenantId,
        companyId,
        branchId,
      );
      if (!paymentRows.length) throw new NotFoundException('Expense payment not found');
      const payment = paymentRows[0];
      if (payment.reversalId) throw new BadRequestException('Expense payment is already reversed.');

      const amount = Number(payment.amount);
      const lines = buildExpensePaymentReversalLines({
        payableAccountId: payment.payableAccountId,
        paymentAccountId: payment.paymentAccountId,
        amount,
      });
      try {
        validateJournalLines(lines);
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Expense payment reversal journal is not balanced.');
      }

      const reversalId = randomUUID();
      const reversedAt = new Date();
      const journal = await tx.journalEntry.create({
        data: {
          tenantId: expense.tenantId,
          companyId: expense.companyId,
          branchId: expense.branchId,
          number: `JE-${reversedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: reversedAt,
          description: `Gider ödeme ters kaydı ${payment.id}: ${reason}`,
          referenceType: 'EXPENSE_PAYMENT_REVERSAL',
          referenceId: reversalId,
          postedAt: reversedAt,
          lines: { create: lines },
        },
        select: { id: true },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO expense_payment_reversals(
           id,tenant_id,company_id,branch_id,expense_payment_id,journal_entry_id,reason,source_type,source_id,created_by
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10::text)`,
        reversalId,
        expense.tenantId,
        expense.companyId,
        expense.branchId,
        payment.id,
        journal.id,
        reason,
        input.sourceType ?? null,
        input.sourceId ?? null,
        actorId,
      );

      const activePaidAmount = Number(await this.activePaymentTotal(tx, expense.id, tenantId, companyId));
      const payableAmount = expensePayableAmount(
        Number(expense.grossAmount),
        Number(expense.withholdingAmount),
      );
      const paymentStatus = expensePaymentStatus(activePaidAmount, payableAmount);
      await tx.$executeRawUnsafe(
        `UPDATE expenses
         SET payment_status=$1::"FinancePaymentStatus",version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2::text`,
        paymentStatus,
        expense.id,
      );
      await this.audit(tx, expense, actorId, 'EXPENSE_PAYMENT_REVERSED', {
        reason,
        before: { paymentStatus: expense.paymentStatus },
        after: { paymentStatus, paidAmount: activePaidAmount, payableAmount, paymentId: payment.id, reversalId },
      });

      return {
        id: reversalId,
        expensePaymentId: payment.id,
        journalEntryId: journal.id,
        paymentStatus,
        paidAmount: activePaidAmount,
        payableAmount,
        remainingAmount: Math.max(0, payableAmount - activePaidAmount),
        reversedAt,
      };
    });
  }

  private async activePaymentTotal(
    tx: Prisma.TransactionClient,
    expenseId: string,
    tenantId: string,
    companyId: string,
  ): Promise<Prisma.Decimal> {
    const rows = await tx.$queryRawUnsafe<Array<{ total: Prisma.Decimal }>>(
      `SELECT COALESCE(SUM(p.amount),0) AS total
       FROM expense_payments p
       LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
       WHERE p.expense_id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text AND r.id IS NULL`,
      expenseId,
      tenantId,
      companyId,
    );
    return rows[0]?.total ?? new Prisma.Decimal(0);
  }

  private async assertExpenseVisible(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Expense not found');
  }

  private async getExpenseForUpdate(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ExpensePaymentContextRow> {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await tx.$queryRawUnsafe<ExpensePaymentContextRow[]>(
      `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",category_id AS "categoryId",
              gross_amount AS "grossAmount",withholding_amount AS "withholdingAmount",approval_status AS "approvalStatus",
              accounting_status AS "accountingStatus",payment_status AS "paymentStatus"
       FROM expenses
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       FOR UPDATE`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Expense not found');
    return rows[0];
  }

  private async audit(
    tx: Prisma.TransactionClient,
    expense: ExpensePaymentContextRow,
    actorId: string,
    eventType: string,
    state: { reason?: string; before: unknown; after: unknown },
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO expense_audit_events(
         id,tenant_id,company_id,branch_id,expense_id,actor_id,event_type,reason,before_state,after_state
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9::jsonb,$10::jsonb)`,
      randomUUID(),
      expense.tenantId,
      expense.companyId,
      expense.branchId,
      expense.id,
      actorId,
      eventType,
      state.reason ?? null,
      JSON.stringify(state.before),
      JSON.stringify(state.after),
    );
  }
}
