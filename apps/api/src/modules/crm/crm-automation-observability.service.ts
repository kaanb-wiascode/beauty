import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import type { CrmAutomationScope } from './crm-automation.service';

export type AutomationRunOrigin = 'MANUAL' | 'SCHEDULER';
export type AutomationRunOperation = 'EVENT_PROCESSOR' | 'STALE_SWEEP';

type AutomationResult = {
  scanned: number;
  created: number;
  skipped: number;
  [key: string]: unknown;
};

@Injectable()
export class CrmAutomationObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T extends AutomationResult>(
    scope: CrmAutomationScope,
    input: {
      origin: AutomationRunOrigin;
      operation: AutomationRunOperation;
      initiatedByUserId?: string;
    },
    work: () => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    try {
      const result = await work();
      await this.record(scope, {
        ...input,
        status: 'SUCCEEDED',
        scanned: result.scanned,
        created: result.created,
        skipped: result.skipped,
        failed: 0,
        metrics: result,
        startedAt,
      });
      return result;
    } catch (error) {
      await this.record(scope, {
        ...input,
        status: 'FAILED',
        scanned: 0,
        created: 0,
        skipped: 0,
        failed: 1,
        metrics: {},
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown automation error',
        startedAt,
      });
      throw error;
    }
  }

  private async record(
    scope: CrmAutomationScope,
    input: {
      origin: AutomationRunOrigin;
      operation: AutomationRunOperation;
      status: 'SUCCEEDED' | 'FAILED';
      scanned: number;
      created: number;
      skipped: number;
      failed: number;
      metrics: Record<string, unknown>;
      errorMessage?: string;
      initiatedByUserId?: string;
      startedAt: Date;
    },
  ) {
    if (!scope.branchId) return;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_automation_runs(
         tenant_id,company_id,branch_id,origin,operation,status,
         scanned,created,skipped,failed,metrics,error_message,initiated_by_user_id,started_at,completed_at
       ) VALUES(
         $1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::text,$14,NOW()
       )`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      input.origin,
      input.operation,
      input.status,
      input.scanned,
      input.created,
      input.skipped,
      input.failed,
      JSON.stringify(input.metrics),
      input.errorMessage ?? null,
      input.initiatedByUserId ?? null,
      input.startedAt,
    );
  }

  async getDashboard(scope: CrmAutomationScope, limit = 30) {
    if (!scope.branchId) {
      return { summary: { runs7d: 0, created7d: 0, failed7d: 0 }, latestRuns: [], ruleActivity: [], ruleChanges: [] };
    }

    const [summaryRows, latestRuns, ruleActivity, ruleChanges] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ runs7d: number; created7d: number; failed7d: number }>>(
        `SELECT
           COUNT(*)::int AS "runs7d",
           COALESCE(SUM(created),0)::int AS "created7d",
           COALESCE(SUM(failed),0)::int AS "failed7d"
         FROM crm_automation_runs
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
           AND started_at >= NOW() - INTERVAL '7 days'`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
      this.prisma.$queryRawUnsafe<Array<{
        id: string;
        origin: AutomationRunOrigin;
        operation: AutomationRunOperation;
        status: 'SUCCEEDED' | 'FAILED';
        scanned: number;
        created: number;
        skipped: number;
        failed: number;
        metrics: Record<string, unknown>;
        errorMessage: string | null;
        startedAt: Date;
        completedAt: Date;
      }>>(
        `SELECT id::text,origin,operation,status,scanned,created,skipped,failed,metrics,
                error_message AS "errorMessage",started_at AS "startedAt",completed_at AS "completedAt"
         FROM crm_automation_runs
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         ORDER BY started_at DESC,id DESC
         LIMIT $4::int`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        Math.min(Math.max(limit, 1), 100),
      ),
      this.prisma.$queryRawUnsafe<Array<{
        ruleKey: string;
        lastActivityAt: Date;
        executions7d: number;
      }>>(
        `SELECT metadata->>'rule' AS "ruleKey",
                MAX(created_at) AS "lastActivityAt",
                COUNT(*) FILTER (
                  WHERE created_at >= NOW() - INTERVAL '7 days'
                    AND COALESCE(metadata->>'markerOnly','false') <> 'true'
                )::int AS "executions7d"
         FROM crm_events
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
           AND event_type='AUTOMATION_EXECUTED'
           AND metadata ? 'rule'
         GROUP BY metadata->>'rule'
         ORDER BY "lastActivityAt" DESC`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
      this.prisma.$queryRawUnsafe<Array<{
        eventId: string;
        ruleKey: string;
        actorUserId: string;
        metadata: Record<string, unknown>;
        createdAt: Date;
      }>>(
        `SELECT e.id AS "eventId",r.rule_key AS "ruleKey",e.actor_user_id AS "actorUserId",
                e.metadata,e.created_at AS "createdAt"
         FROM crm_events e
         JOIN crm_automation_rules r ON r.id=e.automation_rule_id
         WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.branch_id=$3::text
           AND e.event_type='AUTOMATION_RULE_UPDATED'
         ORDER BY e.created_at DESC,e.id DESC
         LIMIT 30`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      ),
    ]);

    return {
      summary: summaryRows[0] ?? { runs7d: 0, created7d: 0, failed7d: 0 },
      latestRuns,
      ruleActivity,
      ruleChanges,
    };
  }
}
