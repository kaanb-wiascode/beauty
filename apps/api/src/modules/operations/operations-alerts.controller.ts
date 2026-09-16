import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { operationsAlertQuerySchema } from './dto/operations-alert.dto';
import { OperationsAlertsService } from './operations-alerts.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/alerts')
export class OperationsAlertsController {
  constructor(private readonly alerts: OperationsAlertsService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Query() query: unknown) {
    return this.alerts.list(operationsAlertQuerySchema.parse(query));
  }
}
