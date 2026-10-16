import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityAnalyticsService } from './quality-analytics.service';

const recurringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional(),
  minOccurrences: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const branchSignalsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

@Controller('quality/analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('quality', 'read')
export class QualityAnalyticsController {
  constructor(private readonly analytics: QualityAnalyticsService) {}

  @Get('recurring-findings')
  recurring(@Query() query: unknown) {
    return this.analytics.recurringFindings(
      recurringQuerySchema.parse(query),
    );
  }

  @Get('root-causes')
  rootCauses(@Query() query: unknown) {
    return this.analytics.rootCausePatterns(
      recurringQuerySchema.parse(query),
    );
  }

  @Get('branch-signals')
  branchSignals(@Query() query: unknown) {
    const parsed = branchSignalsQuerySchema.parse(query);
    return this.analytics.branchSignals(parsed.days);
  }
}
