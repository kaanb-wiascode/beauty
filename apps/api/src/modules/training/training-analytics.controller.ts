import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingAnalyticsService } from './training-analytics.service';

@Controller('training/analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingAnalyticsController {
  constructor(private readonly analytics: TrainingAnalyticsService) {}

  @Get('overview')
  @RequirePermission('training', 'read')
  overview(@Query('days') days?: string) {
    return this.analytics.overview(days ? Number(days) : undefined);
  }

  @Get('staff-risk')
  @RequirePermission('training', 'read')
  staffRisk(@Query('limit') limit?: string) {
    return this.analytics.staffRisk(limit ? Number(limit) : undefined);
  }
}
