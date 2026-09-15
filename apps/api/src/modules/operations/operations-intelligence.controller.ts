import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsIntelligenceService } from './operations-intelligence.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/intelligence')
export class OperationsIntelligenceController {
  constructor(private readonly intelligence: OperationsIntelligenceService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  overview(@Query('hours') hours?: string) {
    const parsed = Number(hours ?? 24);
    return this.intelligence.overview(Number.isFinite(parsed) ? parsed : 24);
  }
}
