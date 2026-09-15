import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type LeadRoutingStrategy = 'ROUND_ROBIN' | 'LEAST_ACTIVE';
export type LeadRoutingTemperature = 'COLD' | 'WARM' | 'HOT';

export interface LeadRoutingConditions {
  sources?: string[];
  temperatures?: LeadRoutingTemperature[];
  minScore?: number;
  maxScore?: number;
  purchaseUrgencies?: string[];
  preferredContactChannels?: string[];
  interestedServiceIds?: string[];
  interestedPackageIds?: string[];
}

export interface LeadRoutingRuleInput {
  name: string;
  priority: number;
  strategy: LeadRoutingStrategy;
  conditions: LeadRoutingConditions;
  team?: string | null;
  enabled: boolean;
  targetUserIds: string[];
}

export interface LeadRoutingRuleUpdateInput {
  version: number;
  name?: string;
  priority?: number;
  strategy?: LeadRoutingStrategy;
  conditions?: LeadRoutingConditions;
  team?: string | null;
  enabled?: boolean;
  targetUserIds?: string[];
}

type DbClient = Prisma.TransactionClient | PrismaService;
type Scope = { tenantId: string; companyId: string; branchId: string };

type LeadRoutingLead = {
  id: string;
  source: string;
  preferredContactChannel: string | null;
  purchaseUrgency: string | null;
  leadScore: number;
  leadTemperature: LeadRoutingTemperature;
  interestedServiceIds: string[];
  interestedPackageIds: string[];
};

type RoutingRuleRow = {
  id: string;
  name: string;
  priority: number;
  strategy: LeadRoutingStrategy;
  conditions: unknown;
  team: string | null;
  version: number;
};

type RoutingTargetRow = {
  id: string;
  userId: string;
  position: number;
  activeCount: bigint | number | string;
};

@Injectable()
export class CrmLeadRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private scope(): Scope {
    const context = this.tenantContext.getContext();
    if (!context.branchId) {
      throw new BadRequestException('CRM lead routing requires an active branch.');
    }
    return {
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId,
    };
  }

  async listRules() {
    const scope = this.scope();
    return this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT r.id,r.name,r.priority,r.strategy,r.conditions,r.team,r.enabled,r.version,
              r.created_by_user_id AS "createdByUserId",r.updated_by_user_id AS "updatedByUserId",
              r.created_at AS "createdAt",r.updated_at AS "updatedAt",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id',t.id,'userId',t.assigned_user_id,'position',t.position,'enabled',t.enabled
                ) ORDER BY t.position,t.id)
                FROM crm_lead_routing_targets t
                WHERE t.routing_rule_id=r.id
              ),'[]'::jsonb) AS targets
       FROM crm_lead_routing_rules r
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text AND r.branch_id=$3::text
       ORDER BY r.priority,r.id`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
  }

  async listRuleEvents(ruleId: string, limit = 50) {
    const scope = this.scope();
    await this.assertRuleInScope(ruleId, scope);
    return this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",metadata,created_at AS "createdAt"
       FROM crm_lead_routing_rule_events
       WHERE routing_rule_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
       ORDER BY created_at DESC,id DESC LIMIT $5`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      Math.min(Math.max(limit, 1), 200),
    );
  }

  async createRule(input: LeadRoutingRuleInput, actorUserId: string) {
    const scope = this.scope();
    return this.prisma.$transaction(async (tx) => {
      await this.assertAssignableUsers(input.targetUserIds, scope, tx);
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `INSERT INTO crm_lead_routing_rules(
           tenant_id,company_id,branch_id,name,priority,strategy,conditions,team,enabled,
           created_by_user_id,updated_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::jsonb,$8,$9,$10::text,$10::text)
         RETURNING id,version`,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        input.name,
        input.priority,
        input.strategy,
        JSON.stringify(input.conditions),
        input.team ?? null,
        input.enabled,
        actorUserId,
      );
      const rule = rows[0];
      await this.replaceTargets(tx, scope, rule.id, input.targetUserIds);
      await this.appendRuleEvent(tx, scope, rule.id, 'RULE_CREATED', actorUserId, {
        name: input.name,
        priority: input.priority,
        strategy: input.strategy,
        conditions: input.conditions,
        team: input.team ?? null,
        enabled: input.enabled,
        targetUserIds: input.targetUserIds,
      });
      return this.getRule(rule.id, tx);
    });
  }

  async updateRule(ruleId: string, input: LeadRoutingRuleUpdateInput, actorUserId: string) {
    const scope = this.scope();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `SELECT id,version FROM crm_lead_routing_rules
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
         LIMIT 1 FOR UPDATE`,
        ruleId,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
      );
      if (!current[0]) throw new NotFoundException('CRM lead routing rule not found.');
      if (current[0].version !== input.version) {
        throw new ConflictException('Lead routing rule changed. Refresh and retry.');
      }
      if (input.targetUserIds) {
        await this.assertAssignableUsers(input.targetUserIds, scope, tx);
      }

      const updated = await tx.$queryRawUnsafe<Array<{ id: string; version: number }>>(
        `UPDATE crm_lead_routing_rules SET
           name=COALESCE($5,name),priority=COALESCE($6,priority),strategy=COALESCE($7,strategy),
           conditions=CASE WHEN $8::boolean THEN $9::jsonb ELSE conditions END,
           team=CASE WHEN $10::boolean THEN $11::text ELSE team END,
           enabled=COALESCE($12,enabled),updated_by_user_id=$13::text,
           version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
           AND version=$14
         RETURNING id,version`,
        ruleId,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        input.name ?? null,
        input.priority ?? null,
        input.strategy ?? null,
        input.conditions !== undefined,
        JSON.stringify(input.conditions ?? {}),
        input.team !== undefined,
        input.team ?? null,
        input.enabled ?? null,
        actorUserId,
        input.version,
      );
      if (!updated[0]) throw new ConflictException('Lead routing rule changed. Refresh and retry.');

      if (input.targetUserIds) {
        await this.replaceTargets(tx, scope, ruleId, input.targetUserIds);
        await tx.$executeRawUnsafe(
          `INSERT INTO crm_lead_routing_cursors(routing_rule_id,next_index,updated_at)
           VALUES($1::text,0,NOW())
           ON CONFLICT(routing_rule_id) DO UPDATE SET next_index=0,updated_at=NOW()`,
          ruleId,
        );
        await this.appendRuleEvent(tx, scope, ruleId, 'TARGETS_REPLACED', actorUserId, {
          targetUserIds: input.targetUserIds,
          version: updated[0].version,
        });
      }

      await this.appendRuleEvent(tx, scope, ruleId, 'RULE_UPDATED', actorUserId, {
        changedFields: Object.keys(input).filter((key) => key !== 'version' && key !== 'targetUserIds'),
        version: updated[0].version,
      });
      return this.getRule(ruleId, tx);
    });
  }

  async routeNewLead(tx: Prisma.TransactionClient, leadId: string, actorUserId: string) {
    const scope = this.scope();
    const leadRows = await tx.$queryRawUnsafe<LeadRoutingLead[]>(
      `SELECT id,source,preferred_contact_channel AS "preferredContactChannel",
              purchase_urgency AS "purchaseUrgency",lead_score AS "leadScore",
              lead_temperature AS "leadTemperature",interested_service_ids AS "interestedServiceIds",
              interested_package_ids AS "interestedPackageIds"
       FROM crm_leads
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
       LIMIT 1`,
      leadId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    const lead = leadRows[0];
    if (!lead) throw new NotFoundException('CRM lead not found for routing.');

    const rules = await tx.$queryRawUnsafe<RoutingRuleRow[]>(
      `SELECT id,name,priority,strategy,conditions,team,version
       FROM crm_lead_routing_rules
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND enabled=TRUE
       ORDER BY priority,id`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    const rule = rules.find((candidate) => this.matches(lead, candidate.conditions));
    if (!rule) return null;

    const lockedRule = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_lead_routing_rules
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text AND enabled=TRUE
       FOR SHARE`,
      rule.id,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    if (!lockedRule[0]) return null;

    const targets = await tx.$queryRawUnsafe<RoutingTargetRow[]>(
      `SELECT t.id,t.assigned_user_id AS "userId",t.position,
              (
                SELECT COUNT(*)::bigint
                FROM crm_conversation_assignments a
                WHERE a.tenant_id=$2::text AND a.company_id=$3::text AND a.branch_id=$4::text
                  AND a.assigned_user_id=t.assigned_user_id
                  AND NOT EXISTS (
                    SELECT 1 FROM crm_conversation_states s
                    WHERE s.tenant_id=a.tenant_id AND s.company_id=a.company_id AND s.branch_id=a.branch_id
                      AND s.status IN ('RESOLVED','CLOSED')
                      AND (
                        (a.customer_id IS NOT NULL AND s.customer_id=a.customer_id) OR
                        (a.lead_id IS NOT NULL AND s.lead_id=a.lead_id) OR
                        (a.opportunity_id IS NOT NULL AND s.opportunity_id=a.opportunity_id)
                      )
                  )
              ) AS "activeCount"
       FROM crm_lead_routing_targets t
       WHERE t.routing_rule_id=$1::text
         AND t.tenant_id=$2::text AND t.company_id=$3::text AND t.branch_id=$4::text
         AND t.enabled=TRUE
         AND EXISTS (
           SELECT 1
           FROM memberships m
           JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
           WHERE m."userId"=t.assigned_user_id
             AND m."tenantId"=$2::text AND m."companyId"=$3::text AND m.status='ACTIVE'
             AND (r.scope<>'BRANCH' OR EXISTS(
               SELECT 1 FROM membership_branch_access mba
               WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
             ))
         )
       ORDER BY t.position,t.id`,
      rule.id,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    if (!targets.length) return null;

    let selected: RoutingTargetRow;
    if (rule.strategy === 'ROUND_ROBIN') {
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_lead_routing_cursors(routing_rule_id,next_index,updated_at)
         VALUES($1::text,0,NOW()) ON CONFLICT(routing_rule_id) DO NOTHING`,
        rule.id,
      );
      const cursorRows = await tx.$queryRawUnsafe<Array<{ nextIndex: bigint | number | string }>>(
        `SELECT next_index AS "nextIndex" FROM crm_lead_routing_cursors
         WHERE routing_rule_id=$1::text FOR UPDATE`,
        rule.id,
      );
      const nextIndex = BigInt(cursorRows[0]?.nextIndex ?? 0);
      selected = targets[Number(nextIndex % BigInt(targets.length))];
      await tx.$executeRawUnsafe(
        `UPDATE crm_lead_routing_cursors SET next_index=next_index+1,updated_at=NOW()
         WHERE routing_rule_id=$1::text`,
        rule.id,
      );
    } else {
      selected = [...targets].sort((left, right) => {
        const leftCount = BigInt(left.activeCount ?? 0);
        const rightCount = BigInt(right.activeCount ?? 0);
        if (leftCount < rightCount) return -1;
        if (leftCount > rightCount) return 1;
        if (left.position !== right.position) return left.position - right.position;
        return left.id.localeCompare(right.id);
      })[0];
    }

    const updated = await tx.$queryRawUnsafe<Array<{ ownerUserId: string; team: string | null }>>(
      `UPDATE crm_leads SET owner_user_id=$5::text,team=COALESCE($6::text,team)
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
       RETURNING owner_user_id AS "ownerUserId",team`,
      leadId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      selected.userId,
      rule.team,
    );
    if (!updated[0]) throw new ConflictException('Lead routing target could not be applied.');

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_conversation_assignments(
         tenant_id,company_id,branch_id,lead_id,assigned_user_id,assigned_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text)
       ON CONFLICT(tenant_id,company_id,branch_id,lead_id) WHERE lead_id IS NOT NULL
       DO UPDATE SET assigned_user_id=EXCLUDED.assigned_user_id,assigned_by_user_id=EXCLUDED.assigned_by_user_id,
                     assigned_at=NOW(),version=crm_conversation_assignments.version+1,updated_at=NOW()`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      leadId,
      selected.userId,
      actorUserId,
    );

    await tx.$executeRawUnsafe(
      `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
       VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_ROUTED',$5::text,$6::jsonb)`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      leadId,
      actorUserId,
      JSON.stringify({
        routingRuleId: rule.id,
        routingRuleName: rule.name,
        strategy: rule.strategy,
        ownerUserId: selected.userId,
        team: updated[0].team,
        activeConversationCount: String(selected.activeCount ?? 0),
      }),
    );

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      strategy: rule.strategy,
      ownerUserId: selected.userId,
      team: updated[0].team,
    };
  }

  private matches(lead: LeadRoutingLead, rawConditions: unknown) {
    const conditions = this.normalizeConditions(rawConditions);
    const includesCaseInsensitive = (values: string[] | undefined, value: string | null) =>
      !values?.length || Boolean(value && values.some((item) => item.toLowerCase() === value.toLowerCase()));

    if (!includesCaseInsensitive(conditions.sources, lead.source)) return false;
    if (conditions.temperatures?.length && !conditions.temperatures.includes(lead.leadTemperature)) return false;
    if (conditions.minScore !== undefined && lead.leadScore < conditions.minScore) return false;
    if (conditions.maxScore !== undefined && lead.leadScore > conditions.maxScore) return false;
    if (!includesCaseInsensitive(conditions.purchaseUrgencies, lead.purchaseUrgency)) return false;
    if (!includesCaseInsensitive(conditions.preferredContactChannels, lead.preferredContactChannel)) return false;
    if (conditions.interestedServiceIds?.length &&
        !conditions.interestedServiceIds.some((id) => lead.interestedServiceIds.includes(id))) return false;
    if (conditions.interestedPackageIds?.length &&
        !conditions.interestedPackageIds.some((id) => lead.interestedPackageIds.includes(id))) return false;
    return true;
  }

  private normalizeConditions(value: unknown): LeadRoutingConditions {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as LeadRoutingConditions;
  }

  private async assertAssignableUsers(userIds: string[], scope: Scope, tx: DbClient) {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) throw new BadRequestException('Lead routing requires at least one target user.');
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=ANY($1::text[])
         AND m."tenantId"=$2::text AND m."companyId"=$3::text AND m.status='ACTIVE'
         AND (r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))`,
      uniqueUserIds,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    const valid = new Set(rows.map((row) => row.id));
    if (uniqueUserIds.some((id) => !valid.has(id))) {
      throw new BadRequestException('One or more lead routing targets are not active branch members.');
    }
  }

  private async replaceTargets(tx: Prisma.TransactionClient, scope: Scope, ruleId: string, userIds: string[]) {
    await tx.$executeRawUnsafe(
      `DELETE FROM crm_lead_routing_targets
       WHERE routing_rule_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO crm_lead_routing_targets(
         routing_rule_id,tenant_id,company_id,branch_id,assigned_user_id,position
       )
       SELECT $1::text,$2::text,$3::text,$4::text,target.user_id,target.ordinality-1
       FROM unnest($5::text[]) WITH ORDINALITY AS target(user_id,ordinality)`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      userIds,
    );
  }

  private appendRuleEvent(
    tx: Prisma.TransactionClient,
    scope: Scope,
    ruleId: string,
    eventType: 'RULE_CREATED' | 'RULE_UPDATED' | 'TARGETS_REPLACED',
    actorUserId: string,
    metadata: Record<string, unknown>,
  ) {
    return tx.$executeRawUnsafe(
      `INSERT INTO crm_lead_routing_rule_events(
         routing_rule_id,tenant_id,company_id,branch_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::text,$7::jsonb)`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      eventType,
      actorUserId,
      JSON.stringify(metadata),
    );
  }

  private async assertRuleInScope(ruleId: string, scope: Scope) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_lead_routing_rules
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text LIMIT 1`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    if (!rows[0]) throw new NotFoundException('CRM lead routing rule not found.');
  }

  private async getRule(ruleId: string, tx: DbClient) {
    const scope = this.scope();
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT r.id,r.name,r.priority,r.strategy,r.conditions,r.team,r.enabled,r.version,
              r.created_by_user_id AS "createdByUserId",r.updated_by_user_id AS "updatedByUserId",
              r.created_at AS "createdAt",r.updated_at AS "updatedAt",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id',t.id,'userId',t.assigned_user_id,'position',t.position,'enabled',t.enabled
                ) ORDER BY t.position,t.id)
                FROM crm_lead_routing_targets t WHERE t.routing_rule_id=r.id
              ),'[]'::jsonb) AS targets
       FROM crm_lead_routing_rules r
       WHERE r.id=$1::text AND r.tenant_id=$2::text AND r.company_id=$3::text AND r.branch_id=$4::text
       LIMIT 1`,
      ruleId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    if (!rows[0]) throw new NotFoundException('CRM lead routing rule not found.');
    return rows[0];
  }
}
