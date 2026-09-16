import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { operationsCapacityQuerySchema } from './dto/operations-resource.dto';
import { OperationsUtilizationService } from './operations-utilization.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/utilization')
export class OperationsUtilizationController {
  constructor(private readonly utilization: OperationsUtilizationService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  summary(@Query() query: unknown) {
    return this.utilization.summary(operationsCapacityQuerySchema.parse(query));
  }
}
