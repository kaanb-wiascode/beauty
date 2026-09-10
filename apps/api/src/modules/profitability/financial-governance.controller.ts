import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialBenchmarkService } from './financial-benchmark.service';
import { FinancialManagementCockpitService } from './financial-management-cockpit.service';
import { ManagementFinanceActionsService } from './management-finance-actions.service';
import { ManagementFinanceAutomationService } from './management-finance-automation.service';

const anomalySchema = z.object({
  days: z.coerce.number().int().min(14).max(365).optional(),
});

const cfoSchema = z.object({
  asOf: z.coerce.date().optional(),
  lookbackDays: z.coerce.number().int().min(7).max(730).optional(),
});

const actionListSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const createActionSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().trim().max(100).optional(),
  sourceType: z.string().trim().max(100).optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

const updateActionSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  resolutionNote: z.string().trim().max(2000).nullable().optional(),
});

const policySchema = z.object({
  criticalHours: z.coerce.number().int().min(1).max(8760).optional(),
  highHours: z.coerce.number().int().min(1).max(8760).optional(),
  mediumHours: z.coerce.number().int().min(1).max(8760).optional(),
  lowHours: z.coerce.number().int().min(1).max(8760).optional(),
  escalationGraceHours: z.coerce.number().int().min(1).max(8760).optional(),
});

@Controller('profitability/cfo')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialGovernanceController {
  constructor(
    private readonly benchmark: FinancialBenchmarkService,
    private readonly actions: ManagementFinanceActionsService,
    private readonly automation: ManagementFinanceAutomationService,
    private readonly cockpit: FinancialManagementCockpitService,
  ) {}

  @Get('branches/benchmark')
  branchBenchmark() {
    return this.benchmark.branchBenchmark();
  }

  @Get('anomalies')
  anomalies(@Query() query: unknown) {
    const parsed = anomalySchema.parse(query);
    return this.benchmark.anomalies(parsed.days ?? 60);
  }

  @Post('actions')
  createAction(@Body() body: unknown) {
    return this.actions.create(createActionSchema.parse(body));
  }

  @Get('actions')
  listActions(@Query() query: unknown) {
    const parsed = actionListSchema.parse(query);
    return this.actions.list(parsed.status, parsed.limit ?? 100);
  }

  @Get('actions/summary')
  actionSummary() {
    return this.actions.summary();
  }

  @Patch('actions/:id')
  updateAction(@Param('id') id: string, @Body() body: unknown) {
    return this.actions.update(id, updateActionSchema.parse(body));
  }

  @Get('actions/policy')
  getActionPolicy() {
    return this.automation.getPolicy();
  }

  @Post('actions/policy')
  setActionPolicy(@Body() body: unknown) {
    return this.automation.setPolicy(policySchema.parse(body));
  }

  @Post('actions/sync-recommendations')
  syncRecommendations(@Query() query: unknown) {
    return this.automation.syncRecommendations(cfoSchema.parse(query));
  }

  @Post('actions/escalate')
  escalateActions(@Query() query: unknown) {
    const parsed = cfoSchema.parse(query);
    return this.automation.escalateOverdue(parsed.asOf ?? new Date());
  }

  @Get('actions/sla')
  actionSla(@Query() query: unknown) {
    const parsed = cfoSchema.parse(query);
    return this.automation.slaSummary(parsed.asOf ?? new Date());
  }

  @Get('management-cockpit')
  managementCockpit(@Query() query: unknown) {
    return this.cockpit.cockpit(cfoSchema.parse(query));
  }
}
