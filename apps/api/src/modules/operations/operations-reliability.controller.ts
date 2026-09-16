import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsReliabilityService } from './operations-reliability.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/reliability')
export class OperationsReliabilityController {
  constructor(private readonly reliability: OperationsReliabilityService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  summary(@Query('days') days?: string) {
    return this.reliability.summary(days ? Number(days) : 180);
  }
}
