import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import type { CrmAutomationScope } from './crm-automation.service';

export type CrmAutomationRuleKey =
  | 'LEAD_FIRST_TOUCH'
  | 'OPPORTUNITY_STAGE_FOLLOW_UP'
  | 'STALE_OPPORTUNITY_FOLLOW_UP';

export type CrmAutomationRule = {
  ruleKey: CrmAutomationRuleKey;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  overridden: boolean;
};

const DEFAULTS: Record<CrmAutomationRuleKey, Record<string, unknown>> = {
  LEAD_FIRST_TOUCH: {
    delayHours: 24,
    channel: 'CALL',
    messageEnabled: false,
    messageChannel: 'WHATSAPP',
    messageTemplate: 'Merhaba, talebinizle ilgili size yardımcı olmak için iletişime geçiyoruz.',
  },
  OPPORTUNITY_STAGE_FOLLOW_UP: {
    defaultDelayDays: 2,
    negotiationDelayDays: 1,
    channel: 'CALL',
    messageEnabled: false,
    messageChannel: 'WHATSAPP',
    messageTemplate: 'Merhaba, sürecinizle ilgili kısa bir bilgilendirme için sizinle iletişime geçiyoruz.',
  },
  STALE_OPPORTUNITY_FOLLOW_UP: { staleDays: 14, delayHours: 24, channel: 'CALL' },
};

const RULE_KEYS = Object.keys(DEFAULTS) as CrmAutomationRuleKey[];

@Injectable()
export class CrmAutomationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: CrmAutomationScope): Promise<CrmAutomationRule[]> {
    if (!scope.branchId) return RULE_KEYS.map((ruleKey) => this.defaultRule(ruleKey));
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        ruleKey: CrmAutomationRuleKey;
        enabled: boolean;
        config: Record<string, unknown>;
        version: number;
      }>
    >(
      `SELECT rule_key AS "ruleKey",enabled,config,version
       FROM crm_automation_rules
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    const byKey = new Map(rows.map((row) => [row.ruleKey, row]));
    return RULE_KEYS.map((ruleKey) => {
      const row = byKey.get(ruleKey);
      return row
        ? {
            ruleKey,
            enabled: row.enabled,
            config: { ...DEFAULTS[ruleKey], ...row.config },
            version: row.version,
            overridden: true,
          }
        : this.defaultRule(ruleKey);
    });
  }

  async get(scope: CrmAutomationScope, ruleKey: CrmAutomationRuleKey) {
    const rules = await this.list(scope);
    return rules.find((rule) => rule.ruleKey === ruleKey) ?? this.defaultRule(ruleKey);
  }

  async upsert(
    scope: CrmAutomationScope,
    ruleKey: CrmAutomationRuleKey,
    input: { enabled: boolean; config: Record<string, unknown>; version?: number },
    actorUserId: string,
  ) {
    if (!scope.branchId) {
      throw new BadRequestException('Active branch is required.');
    }
    const config = { ...DEFAULTS[ruleKey], ...input.config };
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        enabled: boolean;
        config: Record<string, unknown>;
        version: number;
      }>
    >(
      `INSERT INTO crm_automation_rules(
         tenant_id,company_id,branch_id,rule_key,enabled,config,created_by_user_id,updated_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6::jsonb,$7::text,$7::text)
       ON CONFLICT(tenant_id,company_id,branch_id,rule_key) DO UPDATE SET
         enabled=EXCLUDED.enabled,
         config=EXCLUDED.config,
         updated_by_user_id=EXCLUDED.updated_by_user_id,
         updated_at=NOW(),
         version=crm_automation_rules.version+1
       WHERE $8::int IS NULL OR crm_automation_rules.version=$8::int
       RETURNING id,enabled,config,version`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      ruleKey,
      input.enabled,
      JSON.stringify(config),
      actorUserId,
      input.version ?? null,
    );
    if (!rows[0]) {
      throw new ConflictException('Automation rule version conflict.');
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,automation_rule_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::uuid,'AUTOMATION_RULE_UPDATED',$5::text,$6::jsonb)`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      rows[0].id,
      actorUserId,
      JSON.stringify({
        ruleKey,
        enabled: rows[0].enabled,
        config: rows[0].config,
        version: rows[0].version,
      }),
    );
    return {
      ruleKey,
      enabled: rows[0].enabled,
      config: rows[0].config,
      version: rows[0].version,
      overridden: true,
    };
  }

  private defaultRule(ruleKey: CrmAutomationRuleKey): CrmAutomationRule {
    return {
      ruleKey,
      enabled: true,
      config: { ...DEFAULTS[ruleKey] },
      version: 0,
      overridden: false,
    };
  }
}
