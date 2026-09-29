import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { assertFinancialPeriodOpen } from '../finance/domain/financial-period-lock';

interface RecordPosFinancialEventInput {
  eventType: 'REFUND' | 'CHARGEBACK';
  externalEventId: string;
  amount: number;
  feeAmount?: number;
  occurredAt: Date;
}

interface PosScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class PosFinancialEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context(): PosScope {
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
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      `account:${companyId}`,
      code,
    );

    const existing = await tx.chartOfAccount.findFirst({ where: { tenantId, companyId, code }, select: { id: true, active: true } });
    if (existing) {
      if (!existing.active) return tx.chartOfAccount.update({ where: { id: existing.id }, data: { active: true }, select: { id: true } });
      return existing;
    }
    return tx.chartOfAccount.create({ data: { tenantId, companyId, code, name, type }, select: { id: true } });
  }

  async record(posTransactionId: string, input: RecordPosFinancialEventInput) {
    return this.recordInScope(this.context(), posTransactionId, input);
  }

  async recordInScope(ctx: PosScope, posTransactionId: string, input: RecordPosFinancialEventInput) {
    const amount = this.round(input.amount);
    const feeAmount = this.round(input.feeAmount ?? 0);
    if (amount <= 0) throw new BadRequestException('Financial event amount must be positive.');
    if (feeAmount < 0) throw new BadRequestException('Financial event fee cannot be negative.');
    if (!input.externalEventId.trim()) throw new BadRequestException('External event id is required.');
    if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) throw new BadRequestException('Financial event date is invalid.');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.status,p.amount,p.settled_at AS "settledAt",p.sale_payment_id AS "salePaymentId",p.sale_id AS "saleId",p.branch_id AS "branchId"
         FROM pos_transactions p
         WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
           AND ($4::text IS NULL OR p.branch_id=$4::text)
         FOR UPDATE`,
        posTransactionId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!rows.length) throw new NotFoundException('POS transaction not found.');
      const pos = rows[0];
      if (!['CAPTURED','REFUNDED','CHARGEBACK'].includes(pos.status)) {
        throw new BadRequestException('Only captured POS transactions can be refunded or charged back.');
      }

      const duplicate = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,accounting_journal_entry_id AS "accountingJournalEntryId"
         FROM pos_financial_events
         WHERE pos_transaction_id=$1::text AND event_type=$2 AND external_event_id=$3 LIMIT 1`,
        posTransactionId,
        input.eventType,
        input.externalEventId.trim(),
      );
      if (duplicate.length) return { id: duplicate[0].id, duplicate: true, accountingJournalEntryId: duplicate[0].accountingJournalEntryId };

      const aggregateRows = await tx.$queryRawUnsafe<Array<{ total: number; hasChargeback: boolean }>>(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total,
                COALESCE(BOOL_OR(event_type='CHARGEBACK'),FALSE) AS "hasChargeback"
         FROM pos_financial_events
         WHERE pos_transaction_id=$1::text`,
        posTransactionId,
      );
      const priorAmount = this.round(Number(aggregateRows[0]?.total ?? 0));
      const cumulativeAmount = this.round(priorAmount + amount);
      if (cumulativeAmount - Number(pos.amount) > 0.01) {
        throw new BadRequestException('Combined refunds and chargebacks cannot exceed the POS transaction amount.');
      }

      const eventId = randomUUID();
      const receivable = await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '120', 'Alıcılar', 'ASSET');
      const creditAccount = pos.settledAt
        ? await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '102', 'Bankalar', 'ASSET')
        : await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '108', 'POS Alacakları', 'ASSET');
      const feeAccount = feeAmount > 0
        ? await this.ensureAccount(tx, ctx.tenantId, ctx.companyId, '780', 'POS Komisyon Giderleri', 'EXPENSE')
        : null;

      if (!pos.settledAt && feeAmount > 0) {
        throw new BadRequestException('Unsettled POS financial events cannot post an additional bank fee before settlement.');
      }

      await assertFinancialPeriodOpen(tx, {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        branchId: pos.branchId,
        date: input.occurredAt,
      });

      const journal = await tx.journalEntry.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId,
          branchId: pos.branchId,
          number: `JE-POS-${input.eventType}-${input.occurredAt.toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`,
          status: 'POSTED',
          entryDate: input.occurredAt,
          description: `POS ${input.eventType.toLowerCase()} ${input.externalEventId.trim()}`,
          referenceType: `POS_${input.eventType}`,
          referenceId: eventId,
          postedAt: new Date(),
          lines: {
            create: [
              { accountId: receivable.id, debit: amount, credit: 0 },
              ...(feeAccount && feeAmount > 0 ? [{ accountId: feeAccount.id, debit: feeAmount, credit: 0 }] : []),
              { accountId: creditAccount.id, debit: 0, credit: this.round(amount + feeAmount) },
            ],
          },
        },
        select: { id: true },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO pos_financial_events(id,tenant_id,company_id,branch_id,pos_transaction_id,event_type,external_event_id,amount,fee_amount,occurred_at,accounting_journal_entry_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11::text)`,
        eventId,
        ctx.tenantId,
        ctx.companyId,
        pos.branchId,
        posTransactionId,
        input.eventType,
        input.externalEventId.trim(),
        amount,
        feeAmount,
        input.occurredAt,
        journal.id,
      );

      if (pos.salePaymentId) {
        const collectionRows = await tx.$queryRawUnsafe<Array<{ id: string; incomeRecordId: string; amount: Prisma.Decimal; reversedAmount: Prisma.Decimal }>>(
          `SELECT c.id,c.income_record_id AS "incomeRecordId",c.amount,
                  COALESCE((SELECT SUM(r.amount) FROM income_collection_reversals r WHERE r.income_collection_id=c.id),0) AS "reversedAmount"
           FROM income_collections c
           WHERE c.tenant_id=$1::text AND c.company_id=$2::text
             AND c.source_type='SALE_PAYMENT' AND c.source_id=$3::text
           LIMIT 1`,
          ctx.tenantId,
          ctx.companyId,
          pos.salePaymentId,
        );
        const collection = collectionRows[0];
        if (collection) {
          const remainingReversible = this.round(Number(collection.amount) - Number(collection.reversedAmount ?? 0));
          if (amount - remainingReversible > 0.01) {
            throw new BadRequestException('POS financial event exceeds the remaining Finance collection balance.');
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO income_collection_reversals(
               id,tenant_id,company_id,branch_id,income_collection_id,journal_entry_id,amount,reason,
               source_type,source_id,created_by,created_at
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,NOW())
             ON CONFLICT (tenant_id,company_id,source_type,source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
             DO NOTHING`,
            randomUUID(),
            ctx.tenantId,
            ctx.companyId,
            pos.branchId,
            collection.id,
            journal.id,
            amount,
            input.eventType === 'CHARGEBACK' ? 'POS chargeback' : 'POS refund',
            input.eventType === 'CHARGEBACK' ? 'POS_CHARGEBACK' : 'POS_REFUND',
            input.externalEventId.trim(),
            'SYSTEM_POS',
          );

          const statusRows = await tx.$queryRawUnsafe<Array<{ gross: Prisma.Decimal; collected: Prisma.Decimal }>>(
            `SELECT i.gross_amount AS gross,
                    COALESCE(SUM(c.amount-COALESCE((
                      SELECT SUM(r.amount) FROM income_collection_reversals r WHERE r.income_collection_id=c.id
                    ),0)),0) AS collected
             FROM income_records i
             LEFT JOIN income_collections c ON c.income_record_id=i.id
             WHERE i.id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
             GROUP BY i.gross_amount`,
            collection.incomeRecordId,
            ctx.tenantId,
            ctx.companyId,
          );
          const gross = Number(statusRows[0]?.gross ?? 0);
          const collected = Number(statusRows[0]?.collected ?? 0);
          const collectionStatus =
            collected <= 0.01
              ? 'UNCOLLECTED'
              : Math.abs(gross - collected) <= 0.01
                ? 'COLLECTED'
                : 'PARTIALLY_COLLECTED';
          await tx.$executeRawUnsafe(
            `UPDATE income_records
             SET collection_status=$1::"IncomeCollectionStatus",version=version+1,updated_at=NOW()
             WHERE id=$2::text`,
            collectionStatus,
            collection.incomeRecordId,
          );
        }
      }

      const fullyReversed = cumulativeAmount >= this.round(Number(pos.amount) - 0.01);
      const hasChargeback = Boolean(aggregateRows[0]?.hasChargeback) || input.eventType === 'CHARGEBACK';
      const finalStatus = hasChargeback ? 'CHARGEBACK' : 'REFUNDED';
      await tx.$executeRawUnsafe(
        `UPDATE pos_transactions SET status=$2,updated_at=NOW() WHERE id=$1::text`,
        posTransactionId,
        fullyReversed ? finalStatus : 'CAPTURED',
      );

      if (pos.salePaymentId && fullyReversed) {
        await tx.salePayment.updateMany({
          where: { id: pos.salePaymentId, tenantId: ctx.tenantId, branchId: pos.branchId, status: 'COMPLETED' },
          data: {
            status: 'REFUNDED',
            refundedAt: input.occurredAt,
            refundReason: hasChargeback ? 'POS CHARGEBACK' : 'POS PROVIDER REFUND',
          },
        });
      }

      return {
        id: eventId,
        posTransactionId,
        eventType: input.eventType,
        amount,
        feeAmount,
        cumulativeAmount,
        fullyReversed,
        settled: Boolean(pos.settledAt),
        accountingJournalEntryId: journal.id,
        duplicate: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
