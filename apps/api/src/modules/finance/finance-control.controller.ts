import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { FinanceControlService } from './finance-control.service';

@Controller('finance/control')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class FinanceControlController {
  constructor(private readonly service: FinanceControlService) {}

  @Get('projection')
  projection() {
    return this.service.projection();
  }

  @Get('integrity')
  integrity() {
    return this.service.integrity();
  }

  @Get('kpi-validation')
  kpiValidation() {
    return this.service.kpiValidation();
  }

  @Get('audit-trail')
  auditTrail(@Query('limit') limit?: string) {
    return this.service.auditTrail(
      z.coerce.number().int().min(1).max(500).default(200).parse(limit ?? 200),
    );
  }
}
