import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ExecutiveFinanceService } from './executive-finance.service';

const cfoQuerySchema = z.object({
  asOf: z.coerce.date().optional(),
  lookbackDays: z.coerce.number().int().min(7).max(730).optional(),
});

const rankingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('profitability/cfo')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class ExecutiveFinanceController {
  constructor(private readonly executive: ExecutiveFinanceService) {}

  @Get('branches/ranking')
  branchRanking(@Query() query: unknown) {
    const parsed = rankingSchema.parse(query);
    return this.executive.branchRanking(parsed.limit ?? 50);
  }

  @Get('trend-alerts')
  trendAlerts(@Query() query: unknown) {
    return this.executive.trendAlerts(cfoQuerySchema.parse(query));
  }

  @Get('executive-summary')
  executiveSummary(@Query() query: unknown) {
    return this.executive.executiveSummary(cfoQuerySchema.parse(query));
  }
}
