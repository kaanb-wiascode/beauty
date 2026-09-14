import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import {
  CrmAutomationScope,
  CrmAutomationService,
} from './crm-automation.service';

const LEASE_KEY = 'crm-automation-runtime';
const LEASE_MINUTES = 10;
const HEARTBEAT_MS = 2 * 60 * 1000;
const RUN_INTERVAL_MS = 5 * 60 * 1000;
const START_DELAY_MS = 45_000;
const STALE_DAYS = 14;

type ScopeRow = {
  tenantId: string;
  companyId: string;
  branchId: string;
};

@Injectable()
export class CrmAutomationSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CrmAutomationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly automations: CrmAutomationService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), RUN_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.run(), START_DELAY_MS).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async acquireLease(ownerToken: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ ownerToken: string }>>(
      `INSERT INTO crm_automation_scheduler_leases(
         lease_key,owner_token,acquired_at,expires_at,updated_at
       ) VALUES($1,$2,NOW(),NOW()+($3::int * INTERVAL '1 minute'),NOW())
       ON CONFLICT(lease_key) DO UPDATE SET
         owner_token=EXCLUDED.owner_token,
         acquired_at=NOW(),
         expires_at=EXCLUDED.expires_at,
         updated_at=NOW()
       WHERE crm_automation_scheduler_leases.expires_at<=NOW()
       RETURNING owner_token AS "ownerToken"`,
      LEASE_KEY,
      ownerToken,
      LEASE_MINUTES,
    );
    return rows[0]?.ownerToken === ownerToken;
  }

  private async heartbeat(ownerToken: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE crm_automation_scheduler_leases
       SET expires_at=NOW()+($3::int * INTERVAL '1 minute'),updated_at=NOW()
       WHERE lease_key=$1 AND owner_token=$2`,
      LEASE_KEY,
      ownerToken,
      LEASE_MINUTES,
    );
  }

  private async releaseLease(ownerToken: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM crm_automation_scheduler_leases
       WHERE lease_key=$1 AND owner_token=$2`,
      LEASE_KEY,
      ownerToken,
    );
  }

  private async scopes(): Promise<CrmAutomationScope[]> {
    const rows = await this.prisma.$queryRawUnsafe<ScopeRow[]>(
      `WITH candidates AS (
         SELECT e.tenant_id,e.company_id,e.branch_id
         FROM crm_events e
         WHERE e.branch_id IS NOT NULL
           AND e.event_type IN ('LEAD_CREATED','OPPORTUNITY_STAGE_CHANGED')
           AND NOT EXISTS (
             SELECT 1 FROM crm_events a
             WHERE a.tenant_id=e.tenant_id
               AND a.company_id=e.company_id
               AND a.branch_id=e.branch_id
               AND a.event_type='AUTOMATION_EXECUTED'
               AND a.metadata->>'sourceEventId'=e.id::text
           )
         UNION
         SELECT o.tenant_id,o.company_id,o.branch_id
         FROM crm_opportunities o
         WHERE o.branch_id IS NOT NULL
           AND o.owner_user_id IS NOT NULL
           AND o.stage NOT IN ('WON','LOST')
           AND o.updated_at < NOW() - ($1::int * INTERVAL '1 day')
       )
       SELECT tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId"
       FROM candidates
       ORDER BY tenant_id,company_id,branch_id
       LIMIT 500`,
      STALE_DAYS,
    );
    return rows;
  }

  private async processScope(scope: CrmAutomationScope) {
    const events = await this.automations.processPendingEvents(scope);
    const stale = await this.automations.runStaleOpportunitySweep(
      scope,
      STALE_DAYS,
    );
    return {
      created: events.created + stale.created,
      scanned: events.scanned + stale.scanned,
    };
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
          this.logger.warn('CRM automation scheduler lease heartbeat failed.');
        });
      }, HEARTBEAT_MS);
      heartbeatTimer.unref?.();

      const scopes = await this.scopes();
      let created = 0;
      let scanned = 0;
      for (const scope of scopes) {
        const result = await this.processScope(scope);
        created += result.created;
        scanned += result.scanned;
      }
      if (created > 0) {
        this.logger.log(
          `CRM automation scheduler created ${created} follow-up(s) from ${scanned} scanned record(s) across ${scopes.length} scope(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `CRM automation scheduler failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (leaseAcquired) {
        try {
          await this.releaseLease(ownerToken);
        } catch {
          this.logger.warn('CRM automation scheduler lease release failed.');
        }
      }
      this.running = false;
    }
  }
}
