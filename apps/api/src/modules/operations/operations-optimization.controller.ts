import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsOptimizationService } from './operations-optimization.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/optimization')
export class OperationsOptimizationController {
  constructor(private readonly optimization: OperationsOptimizationService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  overview(@Query('hours') hours?: string) {
    const parsed = Number(hours ?? 24);
    return this.optimization.overview(Number.isFinite(parsed) ? parsed : 24);
  }
}
