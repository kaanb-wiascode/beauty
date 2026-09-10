import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface RecordSettlementInput {
  providerSettlementId: string;
  bankAccountId?: string;
  transactionIds: string[];
  settledAt: Date;
}

@Injectable()
export class PosSettlementService {
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

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const existing = await tx.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
      select: { id: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        return tx.chartOfAccount.update({
          where: { id: existing.id },
          data: { active: true },
          select: { id: true },
        });
      }
      return existing;
    }
    return tx.chartOfAccount.create({
      data: { tenantId, companyId, code, name, type },
      select: { id: true },
    });
  }

  async record(integrationId: string, input: RecordSettlementInput) {
    const ctx = this.context();
    const transactionIds = Array.from(new Set(input.transactionIds));
    if (!transactionIds.length) throw new BadRequestException('Settlement must include at least one POS transaction.');
    if (!input.providerSettlementId.trim()) throw new BadRequestException('Provider settlement id is required.');
    if (!(input.settledAt instanceof Date) || Number.isNaN(input.settledAt.getTime())) {
      throw new BadRequestException('Settlement date is invalid.');
    }

    return this.prisma.$transaction(async (tx) => {
      const integrations = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId",kind,status
         FROM finance_integrations
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        integrationId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!integrations.length) throw new NotFoundException('Financial integration not found.');
      const integration = integrations[0];
      if (integration.kind !== 'VIRTUAL_POS') throw new BadRequestException('Only virtual POS integrations can record settlements.');
      if (integration.status !== 'CONNECTED') throw new BadRequestException('POS integration must be connected.');

      if (input.bankAccountId) {
        const bank = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,currency FROM bank_accounts
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text) AND active=TRUE LIMIT 1`,
          input.bankAccountId,
          ctx.tenantId,
          ctx.companyId,
          ctx.branchId,
        );
        if (!bank.length) throw new BadRequestException('Settlement bank account is outside the active company/branch scope.');
      }

      const transactions = await tx.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.amount,p.fee_amount AS "feeAmount",p.net_amount AS "netAmount",p.currency,p.status,p.settled_at AS "settledAt"
         FROM pos_transactions p
         JOIN pos_terminals t ON t.id=p.terminal_id
         WHERE t.integration_id=$1::text AND p.company_id=$2::text AND p.id = ANY($3::text[])
         FOR UPDATE`,
        integrationId,
        ctx.companyId,
        transactionIds,
      );
      if (transactions.length !== transactionIds.length) {
        throw new BadRequestException('One or more POS transactions do not belong to this integration.');
      }
      if (transactions.some((row) => row.status !== 'CAPTURED')) {
        throw new BadRequestException('Only captured POS transactions can be settled.');
      }
      if (transactions.some((row) => row.settledAt)) {
        throw new BadRequestException('One or more POS transactions are already settled.');
      }
      const currencies = new Set(transactions.map((row) => row.currency));
      if (currencies.size !== 1) throw new BadRequestException('A settlement cannot contain multiple currencies.');
      const currency = transactions[0].currency;
      const grossAmount = this.round(transactions.reduce((sum, row) => sum + Number(row.amount), 0));
      const feeAmount = this.round(transactions.reduce((sum, row) => sum + Number(row.feeAmount), 0));
      const netAmount = this.round(transactions.reduce((sum, row) => sum + Number(row.netAmount), 0));
      if (this.round(netAmount + feeAmount) !== grossAmount) {
        throw new BadRequestException('POS settlement amounts are inconsistent: net + fee must equal gross.');
      }

      const existing = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM pos_settlements WHERE integration_id=$1::text AND provider_settlement_id=$2 LIMIT 1`,
        integrationId,
        input.providerSettlementId.trim(),
      );
      if (existing.length) throw new BadRequestException('Provider settlement has already been recorded.');

      const settlementId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO pos_settlements(id,tenant_id,company_id,branch_id,integration_id,bank_account_id,provider_settlement_id,gross_amount,fee_amount,net_amount,currency,settled_at)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12)`,
        settlementId,
        ctx.tenantId,
        ctx.companyId,
        integration.branchId,
        integrationId,
        input.bankAccountId ?? null,
        input.providerSettlementId.trim(),
        grossAmount,
        feeAmount,
        netAmount,
        currency,
        input.settledAt,
      );

      for (const row of transactions) {
        await tx.$executeRawUnsafe(
          `INSERT INTO pos_settlement_items(id,settlement_id,pos_transaction_id,gross_amount,fee_amount,net_amount)
           VALUES($1::text,$2::text,$3::text,$4,$5,$6)`,
          randomUUID(),
          settlementId,
          row.id,
          Number(row.amount),
          Number(row.feeAmount),
          Number(row.netAmount),
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE pos_transactions SET settled_at=$2,updated_at=NOW() WHERE id = ANY($1::text[])`,
        transactionIds,
        input.settledAt,
      );

      const bankAccount = await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '102', 'Bankalar', 'ASSET');
      const posReceivable = await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '108', 'POS Alacakları', 'ASSET');
      const posFee = await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '780', 'POS Komisyon Giderleri', 'EXPENSE');
      const journal = await tx.journalEntry.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          branchId: integration.branchId,
          number: `JE-POS-${input.settledAt.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: input.settledAt,
          description: `POS settlement ${input.providerSettlementId.trim()}`,
          referenceType: 'POS_SETTLEMENT',
          referenceId: settlementId,
          postedAt: new Date(),
          lines: {
            create: [
              { accountId: bankAccount.id, debit: netAmount, credit: 0 },
              ...(feeAmount > 0 ? [{ accountId: posFee.id, debit: feeAmount, credit: 0 }] : []),
              { accountId: posReceivable.id, debit: 0, credit: grossAmount },
            ],
          },
        },
        select: { id: true },
      });
      await tx.$executeRawUnsafe(
        `UPDATE pos_settlements SET accounting_journal_entry_id=$2::text WHERE id=$1::text`,
        settlementId,
        journal.id,
      );

      return this.getWith(tx, settlementId, ctx.companyId, ctx.branchId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async list(integrationId?: string) {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id,s.integration_id AS "integrationId",s.bank_account_id AS "bankAccountId",s.provider_settlement_id AS "providerSettlementId",
              s.gross_amount AS "grossAmount",s.fee_amount AS "feeAmount",s.net_amount AS "netAmount",s.currency,s.settled_at AS "settledAt",
              s.reconciliation_status AS "reconciliationStatus",s.accounting_journal_entry_id AS "accountingJournalEntryId",
              s.matched_bank_transaction_id AS "matchedBankTransactionId"
       FROM pos_settlements s
       WHERE s.company_id=$1::text AND ($2::text IS NULL OR s.branch_id=$2::text)
         AND ($3::text IS NULL OR s.integration_id=$3::text)
       ORDER BY s.settled_at DESC`,
      ctx.companyId,
      ctx.branchId,
      integrationId ?? null,
    );
  }

  private async getWith(client: Prisma.TransactionClient | PrismaService, id: string, companyId: string, branchId: string | null) {
    const rows = await client.$queryRawUnsafe<any[]>(
      `SELECT s.id,s.integration_id AS "integrationId",s.bank_account_id AS "bankAccountId",s.provider_settlement_id AS "providerSettlementId",
              s.gross_amount AS "grossAmount",s.fee_amount AS "feeAmount",s.net_amount AS "netAmount",s.currency,s.settled_at AS "settledAt",
              s.reconciliation_status AS "reconciliationStatus",s.accounting_journal_entry_id AS "accountingJournalEntryId"
       FROM pos_settlements s WHERE s.id=$1::text AND s.company_id=$2::text AND ($3::text IS NULL OR s.branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    return rows[0];
  }
}
