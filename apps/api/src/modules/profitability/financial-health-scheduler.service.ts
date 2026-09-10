import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { FinancialHealthHistoryService } from './financial-health-history.service';

interface SnapshotTarget {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class FinancialHealthSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FinancialHealthSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private bootstrapTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap() {
    this.bootstrapTimer = setTimeout(() => {
      void this.runDailySnapshotBatch().catch((error: unknown) => {
        this.logger.error('Initial financial health snapshot batch failed.', error);
      });
    }, 5_000);
    this.bootstrapTimer.unref();
    this.scheduleNextRun();
  }

  onApplicationShutdown() {
    if (this.timer) clearTimeout(this.timer);
    if (this.bootstrapTimer) clearTimeout(this.bootstrapTimer);
  }

  private startOfDay(value: Date) {
    const result = new Date(value);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private nextScheduledRun(now = new Date()) {
    const next = new Date(now);
    next.setUTCHours(0, 15, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  private scheduleNextRun() {
    const now = new Date();
    const next = this.nextScheduledRun(now);
    const delay = Math.max(1_000, next.getTime() - now.getTime());
    this.timer = setTimeout(() => {
      void this.runDailySnapshotBatch()
        .catch((error: unknown) => {
          this.logger.error('Scheduled financial health snapshot batch failed.', error);
        })
        .finally(() => this.scheduleNextRun());
    }, delay);
    this.timer.unref();
  }

  private async claimRun(runDate: Date) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO financial_health_daily_job_runs(
         run_date,status,started_at,completed_at,failed_at,error_message,
         company_count,branch_count,snapshot_count
       ) VALUES($1::date,'STARTED',NOW(),NULL,NULL,NULL,0,0,0)
       ON CONFLICT(run_date)
       DO UPDATE SET status='STARTED',started_at=NOW(),completed_at=NULL,failed_at=NULL,
                     error_message=NULL,company_count=0,branch_count=0,snapshot_count=0
       WHERE financial_health_daily_job_runs.status='FAILED'
          OR (
            financial_health_daily_job_runs.status='STARTED'
            AND financial_health_daily_job_runs.started_at < NOW() - INTERVAL '2 hours'
          )
       RETURNING id`,
      runDate,
    );
    return rows[0]?.id as string | undefined;
  }

  private async targets(): Promise<SnapshotTarget[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c."tenantId" AS "tenantId",c.id AS "companyId",NULL::text AS "branchId"
       FROM companies c
       WHERE c.status='ACTIVE'
       UNION ALL
       SELECT c."tenantId" AS "tenantId",c.id AS "companyId",b.id AS "branchId"
       FROM companies c
       JOIN branches b ON b."companyId"=c.id
       WHERE c.status='ACTIVE' AND b.status='ACTIVE'
       ORDER BY "companyId","branchId" NULLS FIRST`,
    );
    return rows;
  }

  private async captureTarget(target: SnapshotTarget, asOf: Date) {
    const contextId = ContextIdFactory.create();
    const tenantContext = await this.moduleRef.resolve(TenantContext, contextId, {
      strict: false,
    });
    tenantContext.setContext({
      tenantId: target.tenantId,
      companyId: target.companyId,
      branchId: target.branchId,
      roleScope: target.branchId ? 'BRANCH' : 'COMPANY',
    });

    const history = await this.moduleRef.resolve(
      FinancialHealthHistoryService,
      contextId,
      { strict: false },
    );
    return history.capture({ asOf, lookbackDays: 90 });
  }

  async runDailySnapshotBatch(asOfInput = new Date()) {
    const asOf = this.startOfDay(asOfInput);
    const runId = await this.claimRun(asOf);
    if (!runId) {
      return {
        runDate: asOf,
        skipped: true,
        reason: 'ALREADY_CLAIMED_OR_COMPLETED',
      };
    }

    try {
      const targets = await this.targets();
      let snapshotCount = 0;
      const errors: Array<{
        companyId: string;
        branchId: string | null;
        message: string;
      }> = [];

      for (const target of targets) {
        try {
          await this.captureTarget(target, asOf);
          snapshotCount += 1;
        } catch (error: unknown) {
          errors.push({
            companyId: target.companyId,
            branchId: target.branchId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const companyCount = new Set(targets.map((item) => item.companyId)).size;
      const branchCount = targets.filter((item) => item.branchId !== null).length;
      const status = errors.length === 0 ? 'COMPLETED' : 'FAILED';

      await this.prisma.$executeRawUnsafe(
        `UPDATE financial_health_daily_job_runs
         SET status=$2::text,
             completed_at=CASE WHEN $2::text='COMPLETED' THEN NOW() ELSE NULL END,
             failed_at=CASE WHEN $2::text='FAILED' THEN NOW() ELSE NULL END,
             error_message=$3::text,
             company_count=$4,
             branch_count=$5,
             snapshot_count=$6
         WHERE id=$1::text`,
        runId,
        status,
        errors.length ? JSON.stringify(errors.slice(0, 20)) : null,
        companyCount,
        branchCount,
        snapshotCount,
      );

      return {
        runId,
        runDate: asOf,
        status,
        companyCount,
        branchCount,
        snapshotCount,
        errorCount: errors.length,
        errors,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.$executeRawUnsafe(
        `UPDATE financial_health_daily_job_runs
         SET status='FAILED',failed_at=NOW(),error_message=$2::text
         WHERE id=$1::text`,
        runId,
        message,
      );
      throw error;
    }
  }
}
