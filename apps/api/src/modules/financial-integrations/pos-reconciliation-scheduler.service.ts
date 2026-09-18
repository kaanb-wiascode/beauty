import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';

@Injectable()
export class PosReconciliationSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PosReconciliationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 15 * 60 * 1000);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 45_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const settlements = await this.prisma.$queryRawUnsafe<Array<{
        id: string;
        companyId: string;
        branchId: string | null;
        bankAccountId: string | null;
        netAmount: string;
        currency: string;
        settledAt: Date;
      }>>(
        `SELECT id,company_id AS "companyId",branch_id AS "branchId",bank_account_id AS "bankAccountId",
                net_amount AS "netAmount",currency,settled_at AS "settledAt"
         FROM pos_settlements
         WHERE reconciliation_status='UNMATCHED'
         ORDER BY settled_at ASC
         LIMIT 250`,
      );

      let matched = 0;
      for (const settlement of settlements) {
        const candidates = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id
           FROM bank_transactions
           WHERE company_id=$1::text
             AND (($2::text IS NULL AND branch_id IS NULL) OR branch_id=$2::text)
             AND reconciliation_status='UNMATCHED'
             AND currency=$3
             AND amount>0
             AND ABS(amount-$4::numeric)<=0.01
             AND booked_at BETWEEN $5::timestamptz-INTERVAL '1 day' AND $5::timestamptz+INTERVAL '1 day'
             AND ($6::text IS NULL OR bank_account_id=$6::text)
           ORDER BY booked_at ASC
           LIMIT 2`,
          settlement.companyId,
          settlement.branchId,
          settlement.currency,
          Number(settlement.netAmount),
          settlement.settledAt,
          settlement.bankAccountId,
        );
        if (candidates.length !== 1) continue;

        try {
          await this.prisma.$transaction(async (tx) => {
            const lockedSettlement = await tx.$queryRawUnsafe<any[]>(
              `SELECT id,reconciliation_status FROM pos_settlements WHERE id=$1::text FOR UPDATE`,
              settlement.id,
            );
            const lockedBank = await tx.$queryRawUnsafe<any[]>(
              `SELECT id,reconciliation_status FROM bank_transactions WHERE id=$1::text FOR UPDATE`,
              candidates[0].id,
            );
            if (lockedSettlement[0]?.reconciliation_status !== 'UNMATCHED' || lockedBank[0]?.reconciliation_status !== 'UNMATCHED') return;

            await tx.$executeRawUnsafe(
              `UPDATE pos_settlements
               SET reconciliation_status='MATCHED',matched_bank_transaction_id=$2::text,
                   reconciliation_confidence=100,reconciliation_note='SCHEDULED_AUTO_MATCH',reconciled_at=NOW()
               WHERE id=$1::text`,
              settlement.id,
              candidates[0].id,
            );
            await tx.$executeRawUnsafe(
              `UPDATE bank_transactions SET reconciliation_status='MATCHED' WHERE id=$1::text`,
              candidates[0].id,
            );
            matched += 1;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch {
          // A concurrent manual reconciliation can win safely; retry on the next cycle.
        }
      }
      if (matched > 0) this.logger.log(`Automatically reconciled ${matched} POS settlement(s).`);
    } catch (error) {
      this.logger.error(`POS reconciliation scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
