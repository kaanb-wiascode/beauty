import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CrmLeadRoutingService } from './crm-lead-routing.service';

const uuid = z.string().uuid();
const strategySchema = z.enum([
  'DIRECT_OWNER',
  'ROUND_ROBIN',
  'LEAST_OPEN_LEADS',
  'LEAST_ACTIVE',
  'FALLBACK_QUEUE',
]);
const targetUserIdsSchema = z.array(uuid).max(100).transform((ids) => [...new Set(ids)]);
const routingConditionsSchema = z.object({
  sources: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  campaignIds: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  temperatures: z.array(z.enum(['COLD', 'WARM', 'HOT'])).max(3).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  purchaseUrgencies: z.array(z.enum(['IMMEDIATE', 'THIS_WEEK', 'THIS_MONTH', 'LATER', 'UNKNOWN'])).max(5).optional(),
  preferredContactChannels: z.array(z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER'])).max(6).optional(),
  interestedServiceIds: z.array(uuid).max(50).optional(),
  interestedPackageIds: z.array(uuid).max(50).optional(),
}).strict().refine(
  (value) => value.minScore === undefined || value.maxScore === undefined || value.minScore <= value.maxScore,
  { message: 'minScore must be lower than or equal to maxScore.', path: ['maxScore'] },
);

function validateTargets(value: { strategy?: z.infer<typeof strategySchema>; targetUserIds?: string[] }, ctx: z.RefinementCtx) {
  if (!value.strategy || value.targetUserIds === undefined) return;
  if (value.strategy === 'DIRECT_OWNER' && value.targetUserIds.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DIRECT_OWNER requires exactly one target user.', path: ['targetUserIds'] });
  } else if (value.strategy !== 'FALLBACK_QUEUE' && value.targetUserIds.length < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This routing strategy requires at least one target user.', path: ['targetUserIds'] });
  }
}

const createRoutingRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  strategy: strategySchema,
  conditions: routingConditionsSchema.default({}),
  team: z.string().trim().min(1).max(120).nullable().optional(),
  enabled: z.coerce.boolean().default(true),
  targetUserIds: targetUserIdsSchema.default([]),
}).strict().superRefine(validateTargets);

const updateRoutingRuleSchema = z.object({
  version: z.coerce.number().int().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  priority: z.coerce.number().int().min(0).max(10000).optional(),
  strategy: strategySchema.optional(),
  conditions: routingConditionsSchema.optional(),
  team: z.string().trim().min(1).max(120).nullable().optional(),
  enabled: z.coerce.boolean().optional(),
  targetUserIds: targetUserIdsSchema.optional(),
}).strict().superRefine(validateTargets);

const listEventsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('crm/lead-routing')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmLeadRoutingController {
  constructor(private readonly routing: CrmLeadRoutingService) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('rules')
  @RequirePermission('crm', 'read')
  listRules() {
    return this.routing.listRules();
  }

  @Post('rules')
  @RequirePermission('crm', 'manage')
  createRule(@Body() body: unknown, @Req() request: { user?: { sub?: string } }) {
    return this.routing.createRule(createRoutingRuleSchema.parse(body), this.userId(request));
  }

  @Patch('rules/:id')
  @RequirePermission('crm', 'manage')
  updateRule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    return this.routing.updateRule(uuid.parse(id), updateRoutingRuleSchema.parse(body), this.userId(request));
  }

  @Get('rules/:id/events')
  @RequirePermission('crm', 'read')
  listRuleEvents(@Param('id') id: string, @Query() query: unknown) {
    const filters = listEventsSchema.parse(query);
    return this.routing.listRuleEvents(uuid.parse(id), filters.limit);
  }
}
