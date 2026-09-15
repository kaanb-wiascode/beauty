import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsConsumablesService } from './operations-consumables.service';

const recordActualConsumableSchema = z.object({
  actualQuantity: z.coerce.number().nonnegative().finite(),
  expectedVersion: z.coerce.number().int().nonnegative(),
});

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

  @Patch('executions/:executionId/products/:productId')
  @RequirePermission('appointments', 'update')
  recordActual(
    @Param('executionId', new ParseUUIDPipe()) executionId: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() body: unknown,
  ) {
    return this.consumables.recordActual(
      executionId,
      productId,
      recordActualConsumableSchema.parse(body),
    );
  }
}
