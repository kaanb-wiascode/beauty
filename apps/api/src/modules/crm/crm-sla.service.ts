import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { CrmAutomationRulesService } from './crm-automation-rules.service';
import type { CrmAutomationScope } from './crm-automation.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CrmSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CrmAutomationRulesService,
  ) {}

  private numberConfig(config: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  }

  private async escalationOwner(
    tx: Tx,
    scope: CrmAutomationScope,
    branchId: string,
    ownerUserId: string,
  ) {
    const rows = await tx.$queryRawUnsafe<Array<{ managerUserId: string }>>(
      `SELECT t.manager_user_id AS "managerUserId"
         FROM crm_team_members tm
         JOIN crm_teams t ON t.id=tm.team_id
        WHERE tm.user_id=$1::text
          AND t.tenant_id=$2::text AND t.company_id=$3::text
          AND t.active=TRUE
          AND (t.branch_id IS NULL OR t.branch_id=$4::text)
        ORDER BY CASE WHEN t.branch_id=$4::text THEN 0 ELSE 1 END,t.id
        LIMIT 1`,
      ownerUserId,
      scope.tenantId,
      scope.companyId,
      branchId,
    );
    return rows[0]?.managerUserId ?? ownerUserId;
  }

  private async createEscalationOnce(
    tx: Tx,
    scope: CrmAutomationScope,
    input: {
      branchId: string;
      leadId?: string | null;
      opportunityId?: string | null;
      followUpId?: string | null;
      ownerUserId: string;
      actorUserId: string;
      breachKey: string;
      rule: string;
      title: string;
      dueAt: Date;
      metadata: Record<string, unknown>;
    },
  ) {
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_events
        WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
          AND event_type='SLA_BREACHED'
          AND metadata->>'breachKey'=$4
        LIMIT 1`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.breachKey,
    );
    if (existing.length) return false;

    const assignedUserId = await this.escalationOwner(tx, scope, input.branchId, input.ownerUserId);
    const followUps = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_follow_ups(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,assigned_user_id,channel,due_at,note,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'CALL',$7::timestamptz,$8,$9::text)
       RETURNING id`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      assignedUserId,
      input.dueAt,
      input.title,
      input.actorUserId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'SLA_BREACHED',$7::text,$8::jsonb)`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      followUps[0].id,
      input.actorUserId,
      JSON.stringify({
        breachKey: input.breachKey,
        rule: input.rule,
        originalOwnerUserId: input.ownerUserId,
        escalationOwnerUserId: assignedUserId,
        ...input.metadata,
      }),
    );

    return true;
  }

  async sweep(scope: CrmAutomationScope) {
    if (!scope.branchId) return { scanned: 0, created: 0, skipped: 0 };

    const [leadRule, followUpRule, opportunityRule] = await Promise.all([
      this.rules.get(scope, 'LEAD_FIRST_RESPONSE_SLA'),
      this.rules.get(scope, 'FOLLOW_UP_OVERDUE_ESCALATION'),
      this.rules.get(scope, 'OPPORTUNITY_STALE_ESCALATION'),
    ]);

    let scanned = 0;
    let created = 0;
    let skipped = 0;

    if (leadRule.enabled) {
      const thresholdMinutes = this.numberConfig(leadRule.config, 'thresholdMinutes', 60, 5, 10080);
      const escalationDelayMinutes = this.numberConfig(leadRule.config, 'escalationDelayMinutes', 15, 1, 1440);
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; branchId: string; ownerUserId: string; createdByUserId: string; createdAt: Date }>>(
        `SELECT id,branch_id AS "branchId",owner_user_id AS "ownerUserId",
                created_by_user_id AS "createdByUserId",created_at AS "createdAt"
           FROM crm_leads
          WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
            AND status NOT IN ('LOST','CONVERTED')
            AND owner_user_id IS NOT NULL
            AND first_response_at IS NULL
            AND created_at < NOW() - ($4::int * INTERVAL '1 minute')
          ORDER BY created_at
          LIMIT 100`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        thresholdMinutes,
      );
      scanned += rows.length;
      for (const row of rows) {
        const wasCreated = await this.prisma.$transaction((tx) =>
          this.createEscalationOnce(tx, scope, {
            branchId: row.branchId,
            leadId: row.id,
            ownerUserId: row.ownerUserId,
            actorUserId: row.createdByUserId,
            breachKey: `LEAD_FIRST_RESPONSE:${row.id}`,
            rule: 'LEAD_FIRST_RESPONSE_SLA',
            title: 'SLA uyarısı: potansiyel müşteriye ilk dönüş süresi aşıldı.',
            dueAt: new Date(Date.now() + escalationDelayMinutes * 60 * 1000),
            metadata: { thresholdMinutes, createdAt: row.createdAt.toISOString() },
          }),
        );
        if (wasCreated) created += 1; else skipped += 1;
      }
    }

    if (followUpRule.enabled) {
      const graceMinutes = this.numberConfig(followUpRule.config, 'graceMinutes', 30, 1, 10080);
      const escalationDelayMinutes = this.numberConfig(followUpRule.config, 'escalationDelayMinutes', 15, 1, 1440);
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; branchId: string; leadId: string | null; opportunityId: string | null; assignedUserId: string; dueAt: Date }>>(
        `SELECT id,branch_id AS "branchId",lead_id AS "leadId",opportunity_id AS "opportunityId",
                assigned_user_id AS "assignedUserId",due_at AS "dueAt"
           FROM crm_follow_ups
          WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
            AND status='OPEN'
            AND due_at < NOW() - ($4::int * INTERVAL '1 minute')
          ORDER BY due_at
          LIMIT 100`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        graceMinutes,
      );
      scanned += rows.length;
      for (const row of rows) {
        const wasCreated = await this.prisma.$transaction((tx) =>
          this.createEscalationOnce(tx, scope, {
            branchId: row.branchId,
            leadId: row.leadId,
            opportunityId: row.opportunityId,
            followUpId: row.id,
            ownerUserId: row.assignedUserId,
            actorUserId: row.assignedUserId,
            breachKey: `FOLLOW_UP_OVERDUE:${row.id}`,
            rule: 'FOLLOW_UP_OVERDUE_ESCALATION',
            title: 'SLA uyarısı: müşteri takibi gecikti.',
            dueAt: new Date(Date.now() + escalationDelayMinutes * 60 * 1000),
            metadata: { graceMinutes, originalDueAt: row.dueAt.toISOString(), sourceFollowUpId: row.id },
          }),
        );
        if (wasCreated) created += 1; else skipped += 1;
      }
    }

    if (opportunityRule.enabled) {
      const staleDays = this.numberConfig(opportunityRule.config, 'staleDays', 7, 1, 90);
      const escalationDelayMinutes = this.numberConfig(opportunityRule.config, 'escalationDelayMinutes', 60, 1, 1440);
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; branchId: string; ownerUserId: string; updatedAt: Date }>>(
        `SELECT id,branch_id AS "branchId",owner_user_id AS "ownerUserId",updated_at AS "updatedAt"
           FROM crm_opportunities
          WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
            AND stage NOT IN ('WON','LOST')
            AND owner_user_id IS NOT NULL
            AND updated_at < NOW() - ($4::int * INTERVAL '1 day')
          ORDER BY updated_at
          LIMIT 100`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        staleDays,
      );
      scanned += rows.length;
      for (const row of rows) {
        const wasCreated = await this.prisma.$transaction((tx) =>
          this.createEscalationOnce(tx, scope, {
            branchId: row.branchId,
            opportunityId: row.id,
            ownerUserId: row.ownerUserId,
            actorUserId: row.ownerUserId,
            breachKey: `OPPORTUNITY_STALE:${row.id}:${row.updatedAt.toISOString().slice(0,10)}`,
            rule: 'OPPORTUNITY_STALE_ESCALATION',
            title: `SLA uyarısı: satış fırsatı ${staleDays}+ gündür güncellenmedi.`,
            dueAt: new Date(Date.now() + escalationDelayMinutes * 60 * 1000),
            metadata: { staleDays, updatedAt: row.updatedAt.toISOString() },
          }),
        );
        if (wasCreated) created += 1; else skipped += 1;
      }
    }

    return { scanned, created, skipped };
  }
}
