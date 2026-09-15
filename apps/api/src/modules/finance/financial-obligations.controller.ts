import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { RestrictTenantMutations } from '../../common/tenant/tenant-lifecycle-policy.decorator';
import { FinancialObligationRulesService } from './financial-obligation-rules.service';
import { FinancialObligationsService } from './financial-obligations.service';

const obligationStatuses = [
  'DRAFT', 'SCHEDULED', 'DUE', 'APPROVAL_PENDING', 'APPROVED', 'READY_FOR_PAYMENT',
  'PARTIALLY_PAID', 'PAID', 'RECONCILED', 'POSTED', 'OVERDUE', 'REJECTED', 'CANCELLED',
] as const;

const obligationSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  obligationType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  counterparty: z.string().trim().max(200).nullable().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default('TRY'),
  dueDate: z.coerce.date(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  costCenterId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  sourceType: z.string().trim().max(100).nullable().optional(),
  sourceId: z.string().trim().max(150).nullable().optional(),
});

const ruleSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  obligationType: z.string().trim().min(1).max(100),
  counterparty: z.string().trim().max(200).nullable().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default('TRY'),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  intervalCount: z.coerce.number().int().positive().max(120).default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  costCenterId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  sourceType: z.string().trim().max(100).nullable().optional(),
  sourceId: z.string().trim().max(150).nullable().optional(),
}).refine((value) => !value.endDate || value.endDate >= value.startDate, {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
});

const transitionSchema = z.object({ status: z.enum(obligationStatuses) });

@Controller('finance/obligations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RestrictTenantMutations()
@RequirePermission('finance', 'read')
export class FinancialObligationsController {
  constructor(
    private readonly obligations: FinancialObligationsService,
    private readonly rules: FinancialObligationRulesService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('limit') limit?: string) {
    const parsedStatus = status ? z.enum(obligationStatuses).parse(status) : undefined;
    const parsedLimit = z.coerce.number().int().min(1).max(500).default(100).parse(limit ?? 100);
    return this.obligations.list(parsedStatus, parsedLimit);
  }

  @Get('calendar')
  calendar() {
    return this.obligations.calendar();
  }

  @Get('calendar/entries')
  calendarEntries(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
    const parsedFrom = from ? z.coerce.date().parse(from) : defaultFrom;
    const parsedTo = to ? z.coerce.date().parse(to) : defaultTo;
    const parsedLimit = z.coerce.number().int().min(1).max(500).default(250).parse(limit ?? 250);
    return this.obligations.calendarEntries(parsedFrom, parsedTo, parsedLimit);
  }

  @Post('calendar/refresh-statuses')
  @RequirePermission('finance', 'manage')
  refreshDueStatuses() {
    return this.obligations.refreshDueStatuses();
  }

  @Get('rules')
  listRules(@Query('limit') limit?: string) {
    const parsedLimit = z.coerce.number().int().min(1).max(500).default(100).parse(limit ?? 100);
    return this.rules.list(parsedLimit);
  }

  @Post('rules/generate-active')
  @RequirePermission('finance', 'manage')
  generateActiveRules(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const fromDate = z.coerce.date().parse(from);
    const toDate = z.coerce.date().parse(to);
    const parsedLimit = z.coerce.number().int().min(1).max(500).default(250).parse(limit ?? 250);
    return this.rules.generateActive(fromDate, toDate, user.sub, parsedLimit);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.obligations.get(id);
  }

  @Post()
  @RequirePermission('finance', 'manage')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.obligations.create(obligationSchema.parse(body), user.sub);
  }

  @Post(':id/transition')
  @RequirePermission('finance', 'manage')
  transition(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const input = transitionSchema.parse(body);
    return this.obligations.transition(id, input.status);
  }

  @Post('rules/create')
  @RequirePermission('finance', 'manage')
  createRule(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.rules.create(ruleSchema.parse(body), user.sub);
  }

  @Post('rules/:id/generate')
  @RequirePermission('finance', 'manage')
  generateRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const fromDate = z.coerce.date().parse(from);
    const toDate = z.coerce.date().parse(to);
    return this.rules.generate(id, fromDate, toDate, user.sub);
  }
}
