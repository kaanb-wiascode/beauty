import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingBranchAnalyticsService } from './training-branch-analytics.service';

@Controller('training/analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingBranchAnalyticsController {
  constructor(private readonly analytics: TrainingBranchAnalyticsService) {}

  @Get('branch-signals')
  @RequirePermission('training', 'read')
  branchSignals(@Query('days') days?: string) {
    return this.analytics.branchSignals(days ? Number(days) : undefined);
  }
}
