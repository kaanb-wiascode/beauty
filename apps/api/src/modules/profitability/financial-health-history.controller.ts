import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinancialHealthHistoryService } from './financial-health-history.service';

const snapshotQuerySchema = z.object({
  asOf: z.coerce.date().optional(),
  lookbackDays: z.coerce.number().int().min(7).max(730).optional(),
});

const historyQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(730).default(180),
});

@Controller('profitability/cfo/health')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class FinancialHealthHistoryController {
  constructor(private readonly historyService: FinancialHealthHistoryService) {}

  @Post('snapshots')
  capture(@Query() query: unknown) {
    return this.historyService.capture(snapshotQuerySchema.parse(query));
  }

  @Get('history')
  history(@Query() query: unknown) {
    const parsed = historyQuerySchema.parse(query);
    return this.historyService.history(parsed.from, parsed.to, parsed.limit);
  }

  @Get('trend')
  trend(@Query() query: unknown) {
    return this.historyService.trend(snapshotQuerySchema.parse(query));
  }

  @Get('recommendations')
  recommendations(@Query() query: unknown) {
    return this.historyService.recommendations(snapshotQuerySchema.parse(query));
  }
}
