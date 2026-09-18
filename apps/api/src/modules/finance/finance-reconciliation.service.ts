import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type TargetType = 'EXPENSE_PAYMENT' | 'INCOME_COLLECTION';
const MONEY_TOLERANCE = 0.01;

@Injectable()
export class FinanceReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async matchExpensePayment(paymentId: string, bankTransactionId: string, actorId: string, amount?: number) {
    return this.match('EXPENSE_PAYMENT', paymentId, bankTransactionId, actorId, amount);
  }

  async matchIncomeCollection(collectionId: string, bankTransactionId: string, actorId: string, amount?: number) {
    return this.match('INCOME_COLLECTION', collectionId, bankTransactionId, actorId, amount);
  }

  async suggestExpensePayment(paymentId: string, days = 3) {
    return this.suggest('EXPENSE_PAYMENT', paymentId, days);
  }

  async suggestIncomeCollection(collectionId: string, days = 3) {
    return this.suggest('INCOME_COLLECTION', collectionId, days);
  }

  private async suggest(targetType: TargetType, targetId: string, days = 3) {
    const ctx = this.context();
    const target = await this.getTarget(targetType, targetId, ctx);
    const targetRemaining = Math.max(0, Number(target.amount) - Number(target.allocatedAmount ?? 0));
    if (targetRemaining <= MONEY_TOLERANCE) {
      return { targetType, targetId, remainingAmount: 0, suggestions: [] };
    }

    const boundedDays = Math.min(Math.max(days, 1), 14);
    const sign = targetType === 'EXPENSE_PAYMENT' ? -1 : 1;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT bt.id,bt.bank_account_id AS "bankAccountId",bt.booked_at AS "bookedAt",bt.amount,bt.currency,
              bt.description,
              GREATEST(ABS(bt.amount)-COALESCE((
                SELECT SUM(m.amount) FROM finance_reconciliation_matches m
                WHERE m.bank_transaction_id=bt.id AND m.reversed_at IS NULL
              ),0),0)::numeric AS "remainingAmount",
              ABS(EXTRACT(EPOCH FROM (bt.booked_at-$1::timestamptz))/86400.0) AS "dayDistance"
       FROM bank_transactions bt
       WHERE bt.tenant_id=$2::text AND bt.company_id=$3::text
         AND ($4::text IS NULL OR bt.branch_id=$4::text)
         AND bt.reconciliation_status='UNMATCHED'
         AND bt.currency=$5
         AND SIGN(bt.amount)=$6
         AND bt.booked_at BETWEEN $1::timestamptz-($7::text||' days')::interval
                             AND $1::timestamptz+($7::text||' days')::interval
         AND ABS(bt.amount)-COALESCE((
           SELECT SUM(m.amount) FROM finance_reconciliation_matches m
           WHERE m.bank_transaction_id=bt.id AND m.reversed_at IS NULL
         ),0) > 0.01
       ORDER BY "dayDistance" ASC,bt.booked_at ASC
       LIMIT 20`,
      target.occurredAt,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      target.currency,
      sign,
      boundedDays,
    );

    const normalizedReference = String(target.reference ?? '').trim().toLowerCase();
    const suggestions = rows.map((row) => {
      const dayDistance = Number(row.dayDistance ?? 99);
      const bankRemaining = Number(row.remainingAmount ?? 0);
      const allocationAmount = Math.min(targetRemaining, bankRemaining);
      const exactResidual = Math.abs(bankRemaining - targetRemaining) <= MONEY_TOLERANCE;
      const description = String(row.description ?? '').toLowerCase();
      let confidence = exactResidual ? 70 : 55;
      if (dayDistance <= 0.5) confidence += 20;
      else if (dayDistance <= 1) confidence += 15;
      else if (dayDistance <= 2) confidence += 10;
      if (normalizedReference && description.includes(normalizedReference)) confidence += 10;
      return {
        ...row,
        remainingAmount: bankRemaining,
        allocationAmount,
        exactResidual,
        confidence: Math.min(confidence, 100),
      };
    });

    return { targetType, targetId, remainingAmount: targetRemaining, suggestions };
  }

  async autoMatch(actorId: string, limit = 100) {
    const ctx = this.context();
    const boundedLimit = Math.min(Math.max(limit, 1), 500);
    const targets = await this.prisma.$queryRawUnsafe<Array<{ targetType: TargetType; targetId: string }>>(
      `SELECT * FROM (
         SELECT 'EXPENSE_PAYMENT'::text AS "targetType",ep.id AS "targetId",ep.paid_at AS occurred_at
         FROM expense_payments ep
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
         WHERE ep.tenant_id=$1::text AND ep.company_id=$2::text
           AND ($3::text IS NULL OR ep.branch_id=$3::text)
           AND r.id IS NULL
           AND ep.amount-COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m WHERE m.expense_payment_id=ep.id AND m.reversed_at IS NULL),0)>0.01
         UNION ALL
         SELECT 'INCOME_COLLECTION'::text AS "targetType",ic.id AS "targetId",ic.collected_at AS occurred_at
         FROM income_collections ic
         LEFT JOIN income_collection_reversals r ON r.income_collection_id=ic.id
         WHERE ic.tenant_id=$1::text AND ic.company_id=$2::text
           AND ($3::text IS NULL OR ic.branch_id=$3::text)
           AND r.id IS NULL
           AND ic.amount-COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m WHERE m.income_collection_id=ic.id AND m.reversed_at IS NULL),0)>0.01
       ) candidates
       ORDER BY occurred_at ASC
       LIMIT $4`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      boundedLimit,
    );

    let matched = 0;
    let ambiguous = 0;
    let noCandidate = 0;
    let conflicted = 0;

    for (const target of targets) {
      const result = await this.suggest(target.targetType, target.targetId, 3);
      const best = result.suggestions[0];
      const second = result.suggestions[1];
      if (!best) {
        noCandidate += 1;
        continue;
      }
      if (!best.exactResidual || best.confidence < 90 || (second && second.confidence === best.confidence)) {
        ambiguous += 1;
        continue;
      }
      try {
        await this.match(target.targetType, target.targetId, best.id, actorId, best.allocationAmount);
        matched += 1;
      } catch {
        conflicted += 1;
      }
    }

    return { scanned: targets.length, matched, ambiguous, noCandidate, conflicted };
  }

  private async match(
    targetType: TargetType,
    targetId: string,
    bankTransactionId: string,
    actorId: string,
    requestedAmount?: number,
  ) {
    const ctx = this.context();
    return this.prisma.$transaction(async (tx) => {
      const target = await this.lockTarget(tx, targetType, targetId, ctx);
      const bankRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,amount,currency,reconciliation_status AS "reconciliationStatus"
         FROM bank_transactions
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        bankTransactionId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!bankRows.length) throw new NotFoundException('Bank transaction not found.');
      const bank = bankRows[0];
      if (bank.reconciliationStatus === 'IGNORED' || bank.reconciliationStatus === 'MATCHED') {
        throw new BadRequestException('Bank transaction is not available for allocation.');
      }
      if (bank.currency !== target.currency) {
        throw new BadRequestException('Finance target and bank transaction currencies do not match.');
      }
      if (targetType === 'EXPENSE_PAYMENT' && Number(bank.amount) >= 0) {
        throw new BadRequestException('Expense payment requires a negative bank transaction.');
      }
      if (targetType === 'INCOME_COLLECTION' && Number(bank.amount) <= 0) {
        throw new BadRequestException('Income collection requires a positive bank transaction.');
      }

      const [bankAllocation] = await tx.$queryRawUnsafe<Array<{ allocated: number }>>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS allocated FROM finance_reconciliation_matches
         WHERE bank_transaction_id=$1::text AND reversed_at IS NULL`,
        bankTransactionId,
      );
      const targetColumn = targetType === 'EXPENSE_PAYMENT' ? 'expense_payment_id' : 'income_collection_id';
      const [targetAllocation] = await tx.$queryRawUnsafe<Array<{ allocated: number }>>(
        `SELECT COALESCE(SUM(amount),0)::numeric AS allocated FROM finance_reconciliation_matches
         WHERE ${targetColumn}=$1::text AND reversed_at IS NULL`,
        targetId,
      );

      const bankRemaining = Math.max(0, Math.abs(Number(bank.amount)) - Number(bankAllocation?.allocated ?? 0));
      const targetRemaining = Math.max(0, Number(target.amount) - Number(targetAllocation?.allocated ?? 0));
      if (bankRemaining <= MONEY_TOLERANCE) throw new BadRequestException('Bank transaction is fully allocated.');
      if (targetRemaining <= MONEY_TOLERANCE) throw new BadRequestException('Finance target is fully reconciled.');

      const amount = requestedAmount ?? Math.min(bankRemaining, targetRemaining);
      if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Allocation amount must be greater than zero.');
      if (amount - bankRemaining > MONEY_TOLERANCE) throw new BadRequestException('Allocation exceeds bank transaction remaining amount.');
      if (amount - targetRemaining > MONEY_TOLERANCE) throw new BadRequestException('Allocation exceeds finance target remaining amount.');

      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO finance_reconciliation_matches(
           id,tenant_id,company_id,branch_id,bank_transaction_id,expense_payment_id,income_collection_id,
           amount,currency,matched_by
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::numeric,$9,$10::text)`,
        id,
        ctx.tenantId,
        ctx.companyId,
        target.branchId,
        bankTransactionId,
        targetType === 'EXPENSE_PAYMENT' ? targetId : null,
        targetType === 'INCOME_COLLECTION' ? targetId : null,
        amount,
        target.currency,
        actorId,
      );

      const bankFullyAllocated = bankRemaining - amount <= MONEY_TOLERANCE;
      await tx.$executeRawUnsafe(
        `UPDATE bank_transactions SET reconciliation_status=$2 WHERE id=$1::text`,
        bankTransactionId,
        bankFullyAllocated ? 'MATCHED' : 'UNMATCHED',
      );
      await this.recalculateAggregate(tx, targetType, target.aggregateId, ctx.tenantId, ctx.companyId);
      return this.getMatchWith(tx, id, ctx.tenantId, ctx.companyId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reverse(matchId: string, actorId: string, reason: string) {
    const ctx = this.context();
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new BadRequestException('Reconciliation reversal reason is required.');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT m.id,m.bank_transaction_id AS "bankTransactionId",m.expense_payment_id AS "expensePaymentId",
                m.income_collection_id AS "incomeCollectionId",m.reversed_at AS "reversedAt",
                COALESCE(ep.expense_id,ic.income_record_id) AS "aggregateId"
         FROM finance_reconciliation_matches m
         LEFT JOIN expense_payments ep ON ep.id=m.expense_payment_id
         LEFT JOIN income_collections ic ON ic.id=m.income_collection_id
         WHERE m.id=$1::text AND m.tenant_id=$2::text AND m.company_id=$3::text
           AND ($4::text IS NULL OR m.branch_id=$4::text)
         FOR UPDATE OF m`,
        matchId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!rows.length) throw new NotFoundException('Finance reconciliation match not found.');
      const match = rows[0];
      if (match.reversedAt) throw new BadRequestException('Finance reconciliation match is already reversed.');

      const bankRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM bank_transactions
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         FOR UPDATE`,
        match.bankTransactionId,
        ctx.tenantId,
        ctx.companyId,
      );
      if (!bankRows.length) throw new NotFoundException('Matched bank transaction not found.');

      await tx.$executeRawUnsafe(
        `UPDATE finance_reconciliation_matches
         SET reversed_by=$2::text,reversed_at=CURRENT_TIMESTAMP,reversal_reason=$3
         WHERE id=$1::text`,
        matchId,
        actorId,
        normalizedReason,
      );
      await tx.$executeRawUnsafe(
        `UPDATE bank_transactions SET reconciliation_status='UNMATCHED' WHERE id=$1::text`,
        match.bankTransactionId,
      );

      const targetType: TargetType = match.expensePaymentId ? 'EXPENSE_PAYMENT' : 'INCOME_COLLECTION';
      await this.recalculateAggregate(tx, targetType, match.aggregateId, ctx.tenantId, ctx.companyId);
      return this.getMatchWith(tx, matchId, ctx.tenantId, ctx.companyId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async list(limit = 100) {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,bank_transaction_id AS "bankTransactionId",expense_payment_id AS "expensePaymentId",
              income_collection_id AS "incomeCollectionId",amount,currency,matched_by AS "matchedBy",
              matched_at AS "matchedAt",reversed_by AS "reversedBy",reversed_at AS "reversedAt",
              reversal_reason AS "reversalReason"
       FROM finance_reconciliation_matches
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
       ORDER BY matched_at DESC
       LIMIT $4`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      Math.min(Math.max(limit, 1), 500),
    );
  }

  private async getTarget(
    targetType: TargetType,
    targetId: string,
    ctx: { tenantId: string; companyId: string; branchId: string | null },
  ) {
    const query = targetType === 'EXPENSE_PAYMENT'
      ? `SELECT ep.id,ep.amount,e.currency,ep.branch_id AS "branchId",ep.expense_id AS "aggregateId",
                ep.paid_at AS "occurredAt",ep.reference,
                COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m WHERE m.expense_payment_id=ep.id AND m.reversed_at IS NULL),0)::numeric AS "allocatedAmount"
         FROM expense_payments ep
         JOIN expenses e ON e.id=ep.expense_id
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
         WHERE ep.id=$1::text AND ep.tenant_id=$2::text AND ep.company_id=$3::text
           AND ($4::text IS NULL OR ep.branch_id=$4::text) AND r.id IS NULL
         LIMIT 1`
      : `SELECT ic.id,ic.amount,i.currency,ic.branch_id AS "branchId",ic.income_record_id AS "aggregateId",
                ic.collected_at AS "occurredAt",ic.reference,
                COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m WHERE m.income_collection_id=ic.id AND m.reversed_at IS NULL),0)::numeric AS "allocatedAmount"
         FROM income_collections ic
         JOIN income_records i ON i.id=ic.income_record_id
         LEFT JOIN income_collection_reversals r ON r.income_collection_id=ic.id
         WHERE ic.id=$1::text AND ic.tenant_id=$2::text AND ic.company_id=$3::text
           AND ($4::text IS NULL OR ic.branch_id=$4::text) AND r.id IS NULL
         LIMIT 1`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, targetId, ctx.tenantId, ctx.companyId, ctx.branchId);
    if (!rows.length) {
      throw new NotFoundException(targetType === 'EXPENSE_PAYMENT' ? 'Active expense payment not found.' : 'Active income collection not found.');
    }
    return rows[0];
  }

  private async lockTarget(
    tx: Prisma.TransactionClient,
    targetType: TargetType,
    targetId: string,
    ctx: { tenantId: string; companyId: string; branchId: string | null },
  ) {
    const query = targetType === 'EXPENSE_PAYMENT'
      ? `SELECT ep.id,ep.amount,e.currency,ep.branch_id AS "branchId",ep.expense_id AS "aggregateId"
         FROM expense_payments ep
         JOIN expenses e ON e.id=ep.expense_id
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
         WHERE ep.id=$1::text AND ep.tenant_id=$2::text AND ep.company_id=$3::text
           AND ($4::text IS NULL OR ep.branch_id=$4::text) AND r.id IS NULL
         FOR UPDATE OF ep`
      : `SELECT ic.id,ic.amount,i.currency,ic.branch_id AS "branchId",ic.income_record_id AS "aggregateId"
         FROM income_collections ic
         JOIN income_records i ON i.id=ic.income_record_id
         LEFT JOIN income_collection_reversals r ON r.income_collection_id=ic.id
         WHERE ic.id=$1::text AND ic.tenant_id=$2::text AND ic.company_id=$3::text
           AND ($4::text IS NULL OR ic.branch_id=$4::text) AND r.id IS NULL
         FOR UPDATE OF ic`;
    const rows = await tx.$queryRawUnsafe<any[]>(query, targetId, ctx.tenantId, ctx.companyId, ctx.branchId);
    if (!rows.length) {
      throw new NotFoundException(targetType === 'EXPENSE_PAYMENT' ? 'Active expense payment not found.' : 'Active income collection not found.');
    }
    return rows[0];
  }

  private async recalculateAggregate(
    tx: Prisma.TransactionClient,
    targetType: TargetType,
    aggregateId: string,
    tenantId: string,
    companyId: string,
  ) {
    if (targetType === 'EXPENSE_PAYMENT') {
      const rows = await tx.$queryRawUnsafe<Array<{ totalAmount: number; allocatedAmount: number }>>(
        `SELECT
           COALESCE((SELECT SUM(ep.amount) FROM expense_payments ep
             LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
             WHERE ep.expense_id=$1::text AND ep.tenant_id=$2::text AND ep.company_id=$3::text AND r.id IS NULL),0)::numeric AS "totalAmount",
           COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m
             JOIN expense_payments ep ON ep.id=m.expense_payment_id
             LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=ep.id
             WHERE ep.expense_id=$1::text AND ep.tenant_id=$2::text AND ep.company_id=$3::text
               AND r.id IS NULL AND m.reversed_at IS NULL),0)::numeric AS "allocatedAmount"`,
        aggregateId,
        tenantId,
        companyId,
      );
      await this.updateReconciliationStatus(tx, 'expenses', aggregateId, rows[0]);
      return;
    }

    const rows = await tx.$queryRawUnsafe<Array<{ totalAmount: number; allocatedAmount: number }>>(
      `SELECT
         COALESCE((SELECT SUM(ic.amount) FROM income_collections ic
           LEFT JOIN income_collection_reversals r ON r.income_collection_id=ic.id
           WHERE ic.income_record_id=$1::text AND ic.tenant_id=$2::text AND ic.company_id=$3::text AND r.id IS NULL),0)::numeric AS "totalAmount",
         COALESCE((SELECT SUM(m.amount) FROM finance_reconciliation_matches m
           JOIN income_collections ic ON ic.id=m.income_collection_id
           LEFT JOIN income_collection_reversals r ON r.income_collection_id=ic.id
           WHERE ic.income_record_id=$1::text AND ic.tenant_id=$2::text AND ic.company_id=$3::text
             AND r.id IS NULL AND m.reversed_at IS NULL),0)::numeric AS "allocatedAmount"`,
      aggregateId,
      tenantId,
      companyId,
    );
    await this.updateReconciliationStatus(tx, 'income_records', aggregateId, rows[0]);
  }

  private async updateReconciliationStatus(
    tx: Prisma.TransactionClient,
    table: 'expenses' | 'income_records',
    aggregateId: string,
    amounts?: { totalAmount: number; allocatedAmount: number },
  ) {
    const total = Number(amounts?.totalAmount ?? 0);
    const allocated = Number(amounts?.allocatedAmount ?? 0);
    const status = total <= MONEY_TOLERANCE || allocated <= MONEY_TOLERANCE
      ? 'UNRECONCILED'
      : total - allocated <= MONEY_TOLERANCE
        ? 'RECONCILED'
        : 'PARTIALLY_RECONCILED';
    await tx.$executeRawUnsafe(
      `UPDATE ${table} SET reconciliation_status=$2::"FinanceReconciliationStatus",updated_at=CURRENT_TIMESTAMP WHERE id=$1::text`,
      aggregateId,
      status,
    );
  }

  private async getMatchWith(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
    tenantId: string,
    companyId: string,
  ) {
    const rows = await client.$queryRawUnsafe<any[]>(
      `SELECT id,bank_transaction_id AS "bankTransactionId",expense_payment_id AS "expensePaymentId",
              income_collection_id AS "incomeCollectionId",amount,currency,matched_by AS "matchedBy",
              matched_at AS "matchedAt",reversed_by AS "reversedBy",reversed_at AS "reversedAt",
              reversal_reason AS "reversalReason"
       FROM finance_reconciliation_matches
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       LIMIT 1`,
      id,
      tenantId,
      companyId,
    );
    return rows[0];
  }
}
