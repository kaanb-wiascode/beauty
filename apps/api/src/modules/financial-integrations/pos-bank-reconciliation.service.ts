import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface PosReconciliationScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class PosBankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context(): PosReconciliationScope {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async suggest(settlementId: string, days = 3) {
    return this.suggestInScope(this.context(), settlementId, days);
  }

  async suggestInScope(ctx: PosReconciliationScope, settlementId: string, days = 3) {
    const settlements = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,bank_account_id AS "bankAccountId",net_amount AS "netAmount",currency,settled_at AS "settledAt",reconciliation_status AS "reconciliationStatus"
       FROM pos_settlements
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      settlementId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!settlements.length) throw new NotFoundException('POS settlement not found.');
    const settlement = settlements[0];
    if (settlement.reconciliationStatus === 'MATCHED') {
      return { settlementId, suggestions: [] };
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id,t.bank_account_id AS "bankAccountId",t.booked_at AS "bookedAt",t.amount,t.currency,t.description,
              ABS(EXTRACT(EPOCH FROM (t.booked_at-$2::timestamptz))/86400.0) AS "dayDistance"
       FROM bank_transactions t
       WHERE t.tenant_id=$3::text AND t.company_id=$4::text
         AND ($5::text IS NULL OR t.branch_id=$5::text)
         AND t.reconciliation_status='UNMATCHED'
         AND t.currency=$6
         AND t.amount>0
         AND ABS(t.amount-$7::numeric)<=0.01
         AND t.booked_at BETWEEN $2::timestamptz-($8::text||' days')::interval
                             AND $2::timestamptz+($8::text||' days')::interval
         AND ($1::text IS NULL OR t.bank_account_id=$1::text)
       ORDER BY "dayDistance" ASC,t.booked_at ASC
       LIMIT 20`,
      settlement.bankAccountId ?? null,
      settlement.settledAt,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      settlement.currency,
      Number(settlement.netAmount),
      Math.min(Math.max(days, 1), 14),
    );

    const suggestions = rows.map((row) => {
      const dayDistance = Number(row.dayDistance ?? 99);
      const sameAccount = !settlement.bankAccountId || row.bankAccountId === settlement.bankAccountId;
      let confidence = 70;
      if (dayDistance <= 1) confidence += 20;
      else if (dayDistance <= 2) confidence += 10;
      if (sameAccount) confidence += 10;
      return { ...row, confidence: Math.min(confidence, 100) };
    });
    return { settlementId, suggestions };
  }

  async match(settlementId: string, bankTransactionId: string, confidence = 100, note?: string) {
    return this.matchInScope(this.context(), settlementId, bankTransactionId, confidence, note);
  }

  async matchInScope(
    ctx: PosReconciliationScope,
    settlementId: string,
    bankTransactionId: string,
    confidence = 100,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const settlements = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,bank_account_id AS "bankAccountId",net_amount AS "netAmount",currency,reconciliation_status AS "reconciliationStatus"
         FROM pos_settlements
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        settlementId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!settlements.length) throw new NotFoundException('POS settlement not found.');
      const settlement = settlements[0];
      if (settlement.reconciliationStatus === 'MATCHED') throw new BadRequestException('POS settlement is already matched.');

      const transactions = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,bank_account_id AS "bankAccountId",amount,currency,reconciliation_status AS "reconciliationStatus"
         FROM bank_transactions
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        bankTransactionId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!transactions.length) throw new NotFoundException('Bank transaction not found.');
      const transaction = transactions[0];
      if (transaction.reconciliationStatus !== 'UNMATCHED') throw new BadRequestException('Bank transaction is already reconciled.');
      if (transaction.currency !== settlement.currency) throw new BadRequestException('Settlement and bank transaction currencies do not match.');
      if (Math.abs(Number(transaction.amount) - Number(settlement.netAmount)) > 0.01) throw new BadRequestException('Settlement net amount does not match bank transaction amount.');
      if (settlement.bankAccountId && settlement.bankAccountId !== transaction.bankAccountId) throw new BadRequestException('Bank transaction belongs to a different bank account.');

      await tx.$executeRawUnsafe(
        `UPDATE pos_settlements
         SET reconciliation_status='MATCHED',matched_bank_transaction_id=$2::text,reconciliation_confidence=$3,
             reconciliation_note=$4,reconciled_at=NOW()
         WHERE id=$1::text`,
        settlementId,
        bankTransactionId,
        Math.min(Math.max(confidence, 0), 100),
        note?.trim() || null,
      );
      await tx.$executeRawUnsafe(`UPDATE bank_transactions SET reconciliation_status='MATCHED' WHERE id=$1::text`, bankTransactionId);
      return this.getWith(tx, settlementId, ctx.tenantId, ctx.companyId, ctx.branchId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async ignoreBankTransaction(bankTransactionId: string) {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE bank_transactions
       SET reconciliation_status='IGNORED'
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
         AND reconciliation_status='UNMATCHED'
       RETURNING id,bank_account_id AS "bankAccountId",booked_at AS "bookedAt",amount,currency,description,reconciliation_status AS "reconciliationStatus"`,
      bankTransactionId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!rows.length) throw new BadRequestException('Bank transaction is not available for ignore action.');
    return rows[0];
  }

  async autoMatch(limit = 100) {
    return this.autoMatchInScope(this.context(), limit);
  }

  async autoMatchInScope(ctx: PosReconciliationScope, limit = 100) {
    const settlements = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM pos_settlements
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND reconciliation_status='UNMATCHED'
       ORDER BY settled_at ASC LIMIT $4`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      Math.min(Math.max(limit, 1), 500),
    );
    let matched = 0;
    const skipped: string[] = [];
    for (const settlement of settlements) {
      const result = await this.suggestInScope(ctx, settlement.id, 3);
      const best = result.suggestions[0];
      const second = result.suggestions[1];
      if (!best || best.confidence < 90 || (second && second.confidence === best.confidence)) {
        skipped.push(settlement.id);
        continue;
      }
      try {
        await this.matchInScope(ctx, settlement.id, best.id, best.confidence, 'AUTO_MATCH');
        matched += 1;
      } catch {
        skipped.push(settlement.id);
      }
    }
    return { scanned: settlements.length, matched, skipped: skipped.length };
  }

  async summary() {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE reconciliation_status='MATCHED')::int AS matched,
              COUNT(*) FILTER (WHERE reconciliation_status='UNMATCHED')::int AS unmatched,
              COALESCE(SUM(net_amount) FILTER (WHERE reconciliation_status='UNMATCHED'),0)::numeric AS "unmatchedAmount"
       FROM pos_settlements
       WHERE tenant_id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text)`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    const bank = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) FILTER (WHERE reconciliation_status='UNMATCHED')::int AS "unmatchedBankTransactions",
              COUNT(*) FILTER (WHERE reconciliation_status='IGNORED')::int AS "ignoredBankTransactions"
       FROM bank_transactions
       WHERE tenant_id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text)`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    return { ...(rows[0] ?? { total: 0, matched: 0, unmatched: 0, unmatchedAmount: 0 }), ...(bank[0] ?? { unmatchedBankTransactions: 0, ignoredBankTransactions: 0 }) };
  }

  private async getWith(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
    tenantId: string,
    companyId: string,
    branchId: string | null,
  ) {
    const rows = await client.$queryRawUnsafe<any[]>(
      `SELECT id,integration_id AS "integrationId",bank_account_id AS "bankAccountId",provider_settlement_id AS "providerSettlementId",
              gross_amount AS "grossAmount",fee_amount AS "feeAmount",net_amount AS "netAmount",currency,settled_at AS "settledAt",
              reconciliation_status AS "reconciliationStatus",matched_bank_transaction_id AS "matchedBankTransactionId",
              reconciliation_confidence AS "reconciliationConfidence",reconciliation_note AS "reconciliationNote",reconciled_at AS "reconciledAt"
       FROM pos_settlements
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    return rows[0];
  }
}
