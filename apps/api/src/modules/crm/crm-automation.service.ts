import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { CrmAutomationRulesService } from './crm-automation-rules.service';

type Tx = Prisma.TransactionClient;
type AutomationChannel = 'CALL' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'IN_PERSON' | 'OTHER';

export type CrmAutomationScope = {
  tenantId: string;
  companyId: string;
  branchId: string | null;
};

type AutomationFollowUp = {
  leadId?: string | null;
  opportunityId?: string | null;
  branchId: string;
  assignedUserId: string;
  actorUserId: string;
  channel?: AutomationChannel;
  dueAt: Date;
  note: string;
  automationKey: string;
  rule: string;
};

type StaleOpportunityRow = {
  id: string;
  branchId: string;
  ownerUserId: string;
  updatedAt: Date;
};

type PendingEventRow = {
  id: string;
  eventType: 'LEAD_CREATED' | 'OPPORTUNITY_STAGE_CHANGED';
  branchId: string;
  leadId: string | null;
  opportunityId: string | null;
  actorUserId: string;
  metadata: Record<string, unknown> | null;
};

@Injectable()
export class CrmAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CrmAutomationRulesService,
  ) {}

  private numberConfig(
    config: Record<string, unknown>,
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback;
  }

  private channelConfig(config: Record<string, unknown>, fallback: AutomationChannel = 'CALL') {
    const value = config.channel;
    return ['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER'].includes(String(value))
      ? (value as AutomationChannel)
      : fallback;
  }

  private branchScope(scope: CrmAutomationScope, branchId: string): CrmAutomationScope {
    return { ...scope, branchId };
  }

  private async lockKey(tx: Tx, scope: CrmAutomationScope, key: string) {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))`,
      `${scope.tenantId}:${scope.companyId}:${scope.branchId ?? '*'}:${key}`,
    );
  }

  private async sourceEventProcessed(
    tx: Tx,
    scope: CrmAutomationScope,
    event: PendingEventRow,
  ) {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_events
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND event_type='AUTOMATION_EXECUTED'
         AND metadata->>'sourceEventId'=$4
       LIMIT 1`,
      scope.tenantId,
      scope.companyId,
      event.branchId,
      event.id,
    );
    return rows.length > 0;
  }

  private async createFollowUpOnce(
    tx: Tx,
    scope: CrmAutomationScope,
    input: AutomationFollowUp,
  ) {
    await this.lockKey(tx, scope, `automation:${input.automationKey}`);
    const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_events
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
         AND event_type='AUTOMATION_EXECUTED'
         AND metadata->>'automationKey'=$4
       LIMIT 1`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.automationKey,
    );
    if (existing.length) return { created: false as const };

    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO crm_follow_ups(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,assigned_user_id,channel,due_at,note,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10::text)
       RETURNING id`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      input.assignedUserId,
      input.channel ?? 'CALL',
      input.dueAt,
      input.note,
      input.actorUserId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'FOLLOW_UP_CREATED',$7::text,$8::jsonb
       )`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      rows[0].id,
      input.actorUserId,
      JSON.stringify({
        channel: input.channel ?? 'CALL',
        dueAt: input.dueAt.toISOString(),
        automated: true,
        rule: input.rule,
      }),
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,follow_up_id,event_type,actor_user_id,metadata
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'AUTOMATION_EXECUTED',$7::text,$8::jsonb
       )`,
      scope.tenantId,
      scope.companyId,
      input.branchId,
      input.leadId ?? null,
      input.opportunityId ?? null,
      rows[0].id,
      input.actorUserId,
      JSON.stringify({ automationKey: input.automationKey, rule: input.rule }),
    );

    return { created: true as const, followUpId: rows[0].id };
  }

  async processPendingEvents(scope: CrmAutomationScope, actorUserId?: string) {
    const events = await this.prisma.$queryRawUnsafe<PendingEventRow[]>(
      `SELECT e.id,e.event_type AS "eventType",e.branch_id AS "branchId",e.lead_id AS "leadId",
              e.opportunity_id AS "opportunityId",e.actor_user_id AS "actorUserId",e.metadata
       FROM crm_events e
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text
         AND ($3::text IS NULL OR e.branch_id=$3::text)
         AND e.event_type IN ('LEAD_CREATED','OPPORTUNITY_STAGE_CHANGED')
         AND NOT EXISTS (
           SELECT 1 FROM crm_events a
           WHERE a.tenant_id=e.tenant_id AND a.company_id=e.company_id AND a.branch_id=e.branch_id
             AND a.event_type='AUTOMATION_EXECUTED'
             AND a.metadata->>'sourceEventId'=e.id::text
         )
       ORDER BY e.created_at,e.id
       LIMIT 100`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );

    let created = 0;
    let skipped = 0;
    for (const event of events) {
      const eventScope = this.branchScope(scope, event.branchId);
      const ruleKey = event.eventType === 'LEAD_CREATED'
        ? 'LEAD_FIRST_TOUCH'
        : 'OPPORTUNITY_STAGE_FOLLOW_UP';
      const rule = await this.rules.get(eventScope, ruleKey);
      const result = await this.prisma.$transaction(async (tx) => {
        await this.lockKey(tx, eventScope, `source-event:${event.id}`);
        if (await this.sourceEventProcessed(tx, eventScope, event)) {
          return { created: false as const };
        }
        const effectiveActorUserId = actorUserId ?? event.actorUserId;
        if (!rule.enabled) {
          await this.markSourceEvent(tx, eventScope, event, effectiveActorUserId, ruleKey, 'RULE_DISABLED');
          return { created: false as const };
        }

        if (event.eventType === 'LEAD_CREATED' && event.leadId) {
          const leads = await tx.$queryRawUnsafe<Array<{ ownerUserId: string | null }>>(
            `SELECT owner_user_id AS "ownerUserId" FROM crm_leads
             WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
             LIMIT 1`,
            event.leadId,
            eventScope.tenantId,
            eventScope.companyId,
            event.branchId,
          );
          const ownerUserId = leads[0]?.ownerUserId;
          if (!ownerUserId) {
            await this.markSourceEvent(tx, eventScope, event, effectiveActorUserId, ruleKey, 'NO_OWNER');
            return { created: false as const };
          }
          const delayHours = this.numberConfig(rule.config, 'delayHours', 24, 1, 720);
          const channel = this.channelConfig(rule.config);
          const followUp = await this.createFollowUpOnce(tx, eventScope, {
            leadId: event.leadId,
            branchId: event.branchId,
            assignedUserId: ownerUserId,
            actorUserId: effectiveActorUserId,
            channel,
            dueAt: new Date(Date.now() + delayHours * 60 * 60 * 1000),
            note: 'Otomatik takip: yeni lead için ilk temas.',
            automationKey: `LEAD_FIRST_TOUCH:${event.leadId}`,
            rule: ruleKey,
          });
          await this.markSourceEvent(tx, eventScope, event, effectiveActorUserId, ruleKey);
          return followUp;
        }

        if (event.eventType === 'OPPORTUNITY_STAGE_CHANGED' && event.opportunityId) {
          const opportunities = await tx.$queryRawUnsafe<
            Array<{
              leadId: string | null;
              ownerUserId: string | null;
              stage: string;
              version: number;
            }>
          >(
            `SELECT lead_id AS "leadId",owner_user_id AS "ownerUserId",stage,version
             FROM crm_opportunities
             WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
             LIMIT 1`,
            event.opportunityId,
            eventScope.tenantId,
            eventScope.companyId,
            event.branchId,
          );
          const opportunity = opportunities[0];
          if (!opportunity?.ownerUserId || ['WON', 'LOST'].includes(opportunity.stage)) {
            await this.markSourceEvent(tx, eventScope, event, effectiveActorUserId, ruleKey, 'NOT_ACTIONABLE');
            return { created: false as const };
          }
          const defaultDelayDays = this.numberConfig(rule.config, 'defaultDelayDays', 2, 1, 90);
          const negotiationDelayDays = this.numberConfig(rule.config, 'negotiationDelayDays', 1, 1, 90);
          const delayDays = opportunity.stage === 'NEGOTIATION' ? negotiationDelayDays : defaultDelayDays;
          const channel = this.channelConfig(rule.config);
          const followUp = await this.createFollowUpOnce(tx, eventScope, {
            leadId: opportunity.leadId,
            opportunityId: event.opportunityId,
            branchId: event.branchId,
            assignedUserId: opportunity.ownerUserId,
            actorUserId: effectiveActorUserId,
            channel,
            dueAt: new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000),
            note: `Otomatik takip: fırsat ${opportunity.stage} aşamasına geçti.`,
            automationKey: `OPPORTUNITY_STAGE:${event.opportunityId}:${opportunity.stage}:v${opportunity.version}`,
            rule: ruleKey,
          });
          await this.markSourceEvent(tx, eventScope, event, effectiveActorUserId, ruleKey);
          return followUp;
        }

        return { created: false as const };
      });
      if (result.created) created += 1;
      else skipped += 1;
    }

    return { scanned: events.length, created, skipped };
  }

  private async markSourceEvent(
    tx: Tx,
    scope: CrmAutomationScope,
    event: PendingEventRow,
    actorUserId: string,
    rule: string,
    reason?: string,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,lead_id,opportunity_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'AUTOMATION_EXECUTED',$6::text,$7::jsonb)`,
      scope.tenantId,
      scope.companyId,
      event.branchId,
      event.leadId,
      event.opportunityId,
      actorUserId,
      JSON.stringify({
        sourceEventId: event.id,
        automationKey: `SOURCE_EVENT:${event.id}`,
        rule,
        markerOnly: true,
        ...(reason ? { reason } : {}),
      }),
    );
  }

  async runStaleOpportunitySweep(
    scope: CrmAutomationScope,
    staleDaysOverride?: number,
    actorUserId?: string,
  ) {
    const rule = await this.rules.get(scope, 'STALE_OPPORTUNITY_FOLLOW_UP');
    const staleDays = staleDaysOverride ?? this.numberConfig(rule.config, 'staleDays', 14, 1, 90);
    const delayHours = this.numberConfig(rule.config, 'delayHours', 24, 1, 720);
    const channel = this.channelConfig(rule.config);
    const staleBefore = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    if (!rule.enabled) {
      return { scanned: 0, created: 0, skipped: 0, staleDays, staleBefore, disabled: true };
    }
    const rows = await this.prisma.$queryRawUnsafe<StaleOpportunityRow[]>(
      `SELECT id,branch_id AS "branchId",owner_user_id AS "ownerUserId",updated_at AS "updatedAt"
       FROM crm_opportunities
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND stage NOT IN ('WON','LOST')
         AND owner_user_id IS NOT NULL
         AND updated_at < $4::timestamptz
       ORDER BY updated_at,id
       LIMIT 100`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      staleBefore,
    );

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const rowScope = this.branchScope(scope, row.branchId);
      const result = await this.prisma.$transaction((tx) =>
        this.createFollowUpOnce(tx, rowScope, {
          opportunityId: row.id,
          branchId: row.branchId,
          assignedUserId: row.ownerUserId,
          actorUserId: actorUserId ?? row.ownerUserId,
          channel,
          dueAt: new Date(Date.now() + delayHours * 60 * 60 * 1000),
          note: `Otomatik takip: fırsat ${staleDays}+ gündür hareketsiz.`,
          automationKey: `STALE_OPPORTUNITY:${row.id}:${row.updatedAt.toISOString()}`,
          rule: 'STALE_OPPORTUNITY_FOLLOW_UP',
        }),
      );
      if (result.created) created += 1;
      else skipped += 1;
    }

    return { scanned: rows.length, created, skipped, staleDays, staleBefore, disabled: false };
  }
}
