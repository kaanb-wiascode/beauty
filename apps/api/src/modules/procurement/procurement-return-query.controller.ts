import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementReturnQueryService } from './procurement-return-query.service';

@Controller('procurement/return-operations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class ProcurementReturnQueryController {
  constructor(private readonly returns: ProcurementReturnQueryService) {}

  @Get('purchase-returns/:id')
  getPurchaseReturnDetail(@Param('id') id: string) {
    return this.returns.getPurchaseReturnDetail(id);
  }
}
