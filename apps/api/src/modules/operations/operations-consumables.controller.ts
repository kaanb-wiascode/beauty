import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsConsumablesService } from './operations-consumables.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/consumables')
export class OperationsConsumablesController {
  constructor(private readonly consumables: OperationsConsumablesService) {}

  @Get('executions/:executionId')
  @RequirePermission('appointments', 'read')
  executionSummary(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
  ) {
    return this.consumables.executionSummary(executionId);
  }
}
