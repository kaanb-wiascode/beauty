import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
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
]);

const updateRuleSchema = z.object({
  enabled: z.boolean(),
  version: z.coerce.number().int().min(0).optional(),
  config: z.record(z.string(), z.unknown()),
});

@Controller('crm/automation-rules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmAutomationRulesController {
  constructor(
    private readonly rules: CrmAutomationRulesService,
    private readonly tenantContext: TenantContext,
  ) {}

  private scope() {
    const context = this.tenantContext.getContext();
    return {
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId,
    };
  }

  @Get()
  @RequirePermission('crm', 'read')
  list() {
    return this.rules.list(this.scope());
  }

  @Patch(':ruleKey')
  @RequirePermission('crm', 'manage')
  update(
    @Param('ruleKey') rawRuleKey: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const actorUserId = request.user?.sub;
    if (!actorUserId) throw new Error('Authenticated user id is missing.');
    const ruleKey = ruleKeySchema.parse(rawRuleKey) as CrmAutomationRuleKey;
    const input = updateRuleSchema.parse(body);
    return this.rules.upsert(this.scope(), ruleKey, input, actorUserId);
  }
}
