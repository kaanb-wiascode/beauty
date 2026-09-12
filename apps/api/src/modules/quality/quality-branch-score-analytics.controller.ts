import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityBranchScoreAnalyticsService } from './quality-branch-score-analytics.service';

@Controller('quality/analytics')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityBranchScoreAnalyticsController {
  constructor(private readonly analytics: QualityBranchScoreAnalyticsService) {}

  @Get('branch-scores')
  @RequirePermission('quality', 'read')
  latest() {
    return this.analytics.latest();
  }
}
