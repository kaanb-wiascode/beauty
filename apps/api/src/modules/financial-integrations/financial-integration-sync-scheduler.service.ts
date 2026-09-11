import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';

const LEASE_KEY = 'financial-integration-sync';
const LEASE_MINUTES = 20;
const HEARTBEAT_MS = 5 * 60 * 1000;

@Injectable()
export class FinancialIntegrationSyncSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FinancialIntegrationSyncSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sync: FinancialIntegrationSyncService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 15 * 60 * 1000);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 30_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async acquireLease(ownerToken: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ ownerToken: string }>>(
      `INSERT INTO finance_scheduler_leases(lease_key,owner_token,acquired_at,expires_at,updated_at)
       VALUES($1,$2,NOW(),NOW()+($3::int * INTERVAL '1 minute'),NOW())
       ON CONFLICT(lease_key) DO UPDATE SET
         owner_token=EXCLUDED.owner_token,
         acquired_at=NOW(),
         expires_at=EXCLUDED.expires_at,
         updated_at=NOW()
       WHERE finance_scheduler_leases.expires_at<=NOW()
       RETURNING owner_token AS "ownerToken"`,
      LEASE_KEY,
      ownerToken,
      LEASE_MINUTES,
    );
    return rows[0]?.ownerToken === ownerToken;
  }

  private async heartbeat(ownerToken: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE finance_scheduler_leases
       SET expires_at=NOW()+($3::int * INTERVAL '1 minute'),updated_at=NOW()
       WHERE lease_key=$1 AND owner_token=$2`,
      LEASE_KEY,
      ownerToken,
      LEASE_MINUTES,
    );
  }

  private async releaseLease(ownerToken: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM finance_scheduler_leases WHERE lease_key=$1 AND owner_token=$2`,
      LEASE_KEY,
      ownerToken,
    );
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    const ownerToken = randomUUID();
    let leaseAcquired = false;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    try {
      leaseAcquired = await this.acquireLease(ownerToken);
      if (!leaseAcquired) return;

      heartbeatTimer = setInterval(() => {
        void this.heartbeat(ownerToken).catch(() => {
          this.logger.warn('Financial integration scheduler lease heartbeat failed.');
        });
      }, HEARTBEAT_MS);
      heartbeatTimer.unref?.();

      const results = await this.sync.syncAllConnected();
      const failed = results.filter((result) => !result.ok);
      if (failed.length) {
        this.logger.warn(`Financial integration sync finished with ${failed.length} failure(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Financial integration scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (leaseAcquired) {
        try {
          await this.releaseLease(ownerToken);
        } catch {
          this.logger.warn('Financial integration scheduler lease release failed.');
        }
      }
      this.running = false;
    }
  }
}
