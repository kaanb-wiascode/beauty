import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityAnalyticsService } from './quality-analytics.service';

@Controller('quality/analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityAnalyticsController {
  constructor(private readonly analytics: QualityAnalyticsService) {}

  @Get('recurring-findings')
  @RequirePermission('quality', 'read')
  recurring(@Query('days') days?: string, @Query('minOccurrences') min?: string, @Query('limit') limit?: string) {
    return this.analytics.recurringFindings({ days: days ? Number(days) : undefined, minOccurrences: min ? Number(min) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Get('root-causes')
  @RequirePermission('quality', 'read')
  rootCauses(@Query('days') days?: string, @Query('minOccurrences') min?: string, @Query('limit') limit?: string) {
    return this.analytics.rootCausePatterns({ days: days ? Number(days) : undefined, minOccurrences: min ? Number(min) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Get('branch-signals')
  @RequirePermission('quality', 'read')
  branchSignals(@Query('days') days?: string) {
    return this.analytics.branchSignals(days ? Number(days) : undefined);
  }
}
