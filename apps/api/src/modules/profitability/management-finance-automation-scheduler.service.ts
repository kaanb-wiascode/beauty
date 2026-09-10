import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ManagementFinanceAutomationService } from './management-finance-automation.service';

interface AutomationTarget {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class ManagementFinanceAutomationSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ManagementFinanceAutomationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private bootstrapTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap() {
    this.bootstrapTimer = setTimeout(() => {
      void this.runBatch().catch((error: unknown) => {
        this.logger.error('Initial management finance automation batch failed.', error);
      });
    }, 15_000);
    this.bootstrapTimer.unref();
    this.scheduleNextRun();
  }

  onApplicationShutdown() {
    if (this.timer) clearTimeout(this.timer);
    if (this.bootstrapTimer) clearTimeout(this.bootstrapTimer);
  }

  private nextScheduledRun(now = new Date()) {
    const next = new Date(now);
    next.setUTCHours(0, 30, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  private scheduleNextRun() {
    const now = new Date();
    const next = this.nextScheduledRun(now);
    this.timer = setTimeout(() => {
      void this.runBatch()
        .catch((error: unknown) => {
          this.logger.error('Scheduled management finance automation batch failed.', error);
        })
        .finally(() => this.scheduleNextRun());
    }, Math.max(1_000, next.getTime() - now.getTime()));
    this.timer.unref();
  }

  private async targets(): Promise<AutomationTarget[]> {
    return this.prisma.$queryRawUnsafe<AutomationTarget[]>(
      `SELECT c."tenantId" AS "tenantId",c.id AS "companyId",NULL::text AS "branchId"
       FROM companies c WHERE c.status='ACTIVE'
       UNION ALL
       SELECT c."tenantId" AS "tenantId",c.id AS "companyId",b.id AS "branchId"
       FROM companies c JOIN branches b ON b."companyId"=c.id
       WHERE c.status='ACTIVE' AND b.status='ACTIVE'
       ORDER BY "companyId","branchId" NULLS FIRST`,
    );
  }

  private async runTarget(target: AutomationTarget, asOf: Date) {
    const contextId = ContextIdFactory.create();
    const tenantContext = await this.moduleRef.resolve(TenantContext, contextId, { strict: false });
    tenantContext.setContext({
      tenantId: target.tenantId,
      companyId: target.companyId,
      branchId: target.branchId,
      roleScope: target.branchId ? 'BRANCH' : 'COMPANY',
    });
    const automation = await this.moduleRef.resolve(
      ManagementFinanceAutomationService,
      contextId,
      { strict: false },
    );
    const [sync, escalation] = await Promise.all([
      automation.syncRecommendations({ asOf, lookbackDays: 90 }),
      automation.escalateOverdue(asOf),
    ]);
    return { sync, escalation };
  }

  async runBatch(asOf = new Date()) {
    const targets = await this.targets();
    let created = 0;
    let refreshed = 0;
    let escalated = 0;
    const errors: Array<{ companyId: string; branchId: string | null; message: string }> = [];

    for (const target of targets) {
      try {
        const result = await this.runTarget(target, asOf);
        created += result.sync.created;
        refreshed += result.sync.refreshed;
        escalated += result.escalation.escalatedCount;
      } catch (error: unknown) {
        errors.push({
          companyId: target.companyId,
          branchId: target.branchId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      asOf,
      targetCount: targets.length,
      created,
      refreshed,
      escalated,
      errorCount: errors.length,
      errors,
    };
  }
}
