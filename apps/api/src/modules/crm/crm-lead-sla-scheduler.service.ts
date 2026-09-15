import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { CrmLeadSlaScope, CrmLeadSlaService } from './crm-lead-sla.service';

const LEASE_KEY = 'crm-lead-sla-escalation';
const LEASE_MINUTES = 5;
const RUN_INTERVAL_MS = 60_000;
const START_DELAY_MS = 30_000;

type ScopeRow = CrmLeadSlaScope;

@Injectable()
export class CrmLeadSlaSchedulerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CrmLeadSlaSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: CrmLeadSlaService,
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
       ) VALUES($1,$2,NOW(),NOW()+($3::int*INTERVAL '1 minute'),NOW())
       ON CONFLICT(lease_key) DO UPDATE SET
         owner_token=EXCLUDED.owner_token,acquired_at=NOW(),expires_at=EXCLUDED.expires_at,updated_at=NOW()
       WHERE crm_automation_scheduler_leases.expires_at<=NOW()
       RETURNING owner_token AS "ownerToken"`,
      LEASE_KEY,
      ownerToken,
      LEASE_MINUTES,
    );
    return rows[0]?.ownerToken === ownerToken;
  }

  private async releaseLease(ownerToken: string) {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM crm_automation_scheduler_leases WHERE lease_key=$1 AND owner_token=$2`,
      LEASE_KEY,
      ownerToken,
    );
  }

  private async scopes() {
    return this.prisma.$queryRawUnsafe<ScopeRow[]>(
      `SELECT DISTINCT tenant_id AS "tenantId",company_id AS "companyId",branch_id AS "branchId"
       FROM crm_lead_sla_clocks
       WHERE completed_at IS NULL
         AND (warning_due_at<=NOW() OR owner_escalation_due_at<=NOW() OR manager_escalation_due_at<=NOW() OR reassignment_due_at<=NOW())
       ORDER BY tenant_id,company_id,branch_id
       LIMIT 500`,
    );
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    const ownerToken = randomUUID();
    let leaseAcquired = false;
    try {
      leaseAcquired = await this.acquireLease(ownerToken);
      if (!leaseAcquired) return;
      const scopes = await this.scopes();
      let created = 0;
      for (const scope of scopes) {
        const result = await this.sla.processDueEscalations(scope);
        created += result.created;
      }
      if (created > 0) {
        this.logger.warn(`CRM lead SLA scheduler created ${created} escalation event(s) across ${scopes.length} scope(s).`);
      }
    } catch (error) {
      this.logger.error(
        `CRM lead SLA scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      if (leaseAcquired) {
        try {
          await this.releaseLease(ownerToken);
        } catch {
          this.logger.warn('CRM lead SLA scheduler lease release failed.');
        }
      }
      this.running = false;
    }
  }
}
