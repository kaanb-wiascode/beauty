import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  CrmAutomationRuleKey,
  CrmAutomationRulesService,
} from './crm-automation-rules.service';

const ruleKeySchema = z.enum([
  'LEAD_FIRST_TOUCH',
  'OPPORTUNITY_STAGE_FOLLOW_UP',
  'STALE_OPPORTUNITY_FOLLOW_UP',
  'LEAD_FIRST_RESPONSE_SLA',
  'FOLLOW_UP_OVERDUE_ESCALATION',
  'OPPORTUNITY_STALE_ESCALATION',
]);
const channel = z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER']);
const messageChannel = z.enum(['SMS', 'EMAIL', 'WHATSAPP']);
const messageAction = {
  messageEnabled: z.boolean(),
  messageChannel,
  messageTemplate: z.string().trim().min(1).max(2000),
};
const common = z.object({
  enabled: z.boolean(),
  version: z.coerce.number().int().min(0).optional(),
});
const leadRuleSchema = common.extend({
  config: z.object({ delayHours: z.coerce.number().int().min(1).max(720), channel, ...messageAction }).strict(),
});
const stageRuleSchema = common.extend({
  config: z.object({
    defaultDelayDays: z.coerce.number().int().min(1).max(90),
    negotiationDelayDays: z.coerce.number().int().min(1).max(90),
    channel,
    ...messageAction,
  }).strict(),
});
const staleRuleSchema = common.extend({
  config: z.object({ staleDays: z.coerce.number().int().min(1).max(90), delayHours: z.coerce.number().int().min(1).max(720), channel }).strict(),
});
const leadSlaRuleSchema = common.extend({
  config: z.object({
    thresholdMinutes: z.coerce.number().int().min(5).max(10080),
    escalationDelayMinutes: z.coerce.number().int().min(1).max(1440),
    channel,
  }).strict(),
});
const followUpSlaRuleSchema = common.extend({
  config: z.object({
    graceMinutes: z.coerce.number().int().min(1).max(10080),
    escalationDelayMinutes: z.coerce.number().int().min(1).max(1440),
    channel,
  }).strict(),
});
const opportunitySlaRuleSchema = common.extend({
  config: z.object({
    staleDays: z.coerce.number().int().min(1).max(90),
    escalationDelayMinutes: z.coerce.number().int().min(1).max(1440),
    channel,
  }).strict(),
});

@Controller('crm/automation-rules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmAutomationRulesController {
  constructor(private readonly rules: CrmAutomationRulesService, private readonly tenantContext: TenantContext) {}

  private scope() {
    const context = this.tenantContext.getContext();
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  @Get()
  @RequirePermission('crm', 'read')
  list() { return this.rules.list(this.scope()); }

  @Patch(':ruleKey')
  @RequirePermission('crm', 'manage')
  update(@Param('ruleKey') rawRuleKey: string, @Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new UnauthorizedException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    const ruleKey = ruleKeySchema.parse(rawRuleKey) as CrmAutomationRuleKey;
    const input = ruleKey === 'LEAD_FIRST_TOUCH'
      ? leadRuleSchema.parse(body)
      : ruleKey === 'OPPORTUNITY_STAGE_FOLLOW_UP'
        ? stageRuleSchema.parse(body)
        : ruleKey === 'STALE_OPPORTUNITY_FOLLOW_UP'
          ? staleRuleSchema.parse(body)
          : ruleKey === 'LEAD_FIRST_RESPONSE_SLA'
            ? leadSlaRuleSchema.parse(body)
            : ruleKey === 'FOLLOW_UP_OVERDUE_ESCALATION'
              ? followUpSlaRuleSchema.parse(body)
              : opportunitySlaRuleSchema.parse(body);
    return this.rules.upsert(this.scope(), ruleKey, input, actorUserId);
  }
}
