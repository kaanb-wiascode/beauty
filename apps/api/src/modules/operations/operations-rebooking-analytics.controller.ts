import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsRebookingAnalyticsService } from './operations-rebooking-analytics.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/rebooking-analytics')
export class OperationsRebookingAnalyticsController {
  constructor(private readonly analytics: OperationsRebookingAnalyticsService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  summary(@Query('days') days?: string) {
    return this.analytics.summary(days ? Number(days) : 90);
  }
}
