import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialBenchmarkService } from './financial-benchmark.service';
import { ManagementFinanceActionsService } from './management-finance-actions.service';

const anomalySchema = z.object({
  days: z.coerce.number().int().min(14).max(365).optional(),
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

@Controller('profitability/cfo')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialGovernanceController {
  constructor(
    private readonly benchmark: FinancialBenchmarkService,
    private readonly actions: ManagementFinanceActionsService,
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
}
