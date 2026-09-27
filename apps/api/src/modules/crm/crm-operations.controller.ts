import {
  Controller,
  Get,
  Param,
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
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmAutomationObservabilityService } from './crm-automation-observability.service';
import { CrmAutomationService } from './crm-automation.service';
import { CrmCustomer360Service } from './crm-customer360.service';
import { CrmOperationsService } from './crm-operations.service';
import { CrmReminderService } from './crm-reminder.service';
import { CrmReportingService } from './crm-reporting.service';

const uuid = z.string().uuid();

const actionFollowUpsSchema = z
  .object({
    mode: z.enum(['OVERDUE', 'TODAY']),
    dayStart: z.coerce.date(),
    dayEnd: z.coerce.date(),
    assignedUserId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    message: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.',
    path: ['dayEnd'],
  });

const staleOpportunitiesSchema = z.object({
  staleBefore: z.coerce.date(),
  ownerUserId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const reminderFeedSchema = z
  .object({
    scope: z.enum(['MINE', 'TEAM']).default('MINE'),
    dayStart: z.coerce.date(),
    dayEnd: z.coerce.date(),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    closeThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    staleBefore: z.coerce.date(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    message: 'Bitiş zamanı başlangıç zamanından sonra olmalıdır.',
    path: ['dayEnd'],
  })
  .refine((value) => value.closeThrough >= value.today, {
    message: 'Kapanış tarihi bugünden önce olamaz.',
    path: ['closeThrough'],
  });

const staleSweepSchema = z.object({
  staleDays: z.coerce.number().int().min(1).max(90).optional(),
});

const reportRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
}).refine((value) => value.to >= value.from, {
  message: 'Rapor bitiş tarihi başlangıç tarihinden önce olamaz.',
  path: ['to'],
});

const automationHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

@Controller('crm/operations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CrmOperationsController {
  constructor(
    private readonly operations: CrmOperationsService,
    private readonly customer360: CrmCustomer360Service,
    private readonly reminders: CrmReminderService,
    private readonly reporting: CrmReportingService,
    private readonly automations: CrmAutomationService,
    private readonly automationObservability: CrmAutomationObservabilityService,
    private readonly tenantContext: TenantContext,
  ) {}

  private userId(request: { user?: { sub?: string } }) {
    const id = request.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Oturum açmış kullanıcı bilgisi bulunamadı.');
    }
    return id;
  }

  private automationScope() {
    const context = this.tenantContext.getContext();
    return {
      tenantId: context.tenantId,
      companyId: context.companyId,
      branchId: context.branchId,
    };
  }

  @Get('follow-ups')
  @RequirePermission('crm', 'read')
  listFollowUps(@Query() query: unknown) {
    return this.operations.listActionFollowUps(actionFollowUpsSchema.parse(query));
  }

  @Get('stale-opportunities')
  @RequirePermission('crm', 'read')
  listStaleOpportunities(@Query() query: unknown) {
    return this.operations.listStaleOpportunities(staleOpportunitiesSchema.parse(query));
  }

  @Get('reminders')
  @RequirePermission('crm', 'read')
  getReminders(
    @Query() query: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const filters = reminderFeedSchema.parse(query);
    return this.reminders.getFeed({
      ...filters,
      userId: this.userId(request),
    });
  }

  @Get('automations/history')
  @RequirePermission('crm', 'read')
  getAutomationHistory(@Query() query: unknown) {
    const { limit } = automationHistorySchema.parse(query);
    return this.automationObservability.getDashboard(this.automationScope(), limit);
  }

  @Post('automations/process-events')
  @RequirePermission('crm', 'manage')
  processAutomationEvents(@Req() request: { user?: { sub?: string } }) {
    const scope = this.automationScope();
    const actorUserId = this.userId(request);
    return this.automationObservability.execute(
      scope,
      { origin: 'MANUAL', operation: 'EVENT_PROCESSOR', initiatedByUserId: actorUserId },
      () => this.automations.processPendingEvents(scope, actorUserId),
    );
  }

  @Post('automations/stale-sweep')
  @RequirePermission('crm', 'manage')
  runStaleSweep(
    @Query() query: unknown,
    @Req() request: { user?: { sub?: string } },
  ) {
    const { staleDays } = staleSweepSchema.parse(query);
    const scope = this.automationScope();
    const actorUserId = this.userId(request);
    return this.automationObservability.execute(
      scope,
      { origin: 'MANUAL', operation: 'STALE_SWEEP', initiatedByUserId: actorUserId },
      () => this.automations.runStaleOpportunitySweep(scope, staleDays, actorUserId),
    );
  }

  @Get('reports/daily')
  @RequirePermission('crm', 'read')
  getDailyReport(@Query() query: unknown) {
    return this.reporting.performance(reportRangeSchema.parse(query));
  }

  @Get('reports/salespeople')
  @RequirePermission('crm', 'read')
  getSalespeopleReport(@Query() query: unknown) {
    return this.reporting.salespersonPerformance(reportRangeSchema.parse(query));
  }

  @Get('customer-360/:customerId')
  @RequirePermission('crm', 'read')
  getCustomer360(@Param('customerId') customerId: string) {
    return this.customer360.getSummary(uuid.parse(customerId));
  }
}
