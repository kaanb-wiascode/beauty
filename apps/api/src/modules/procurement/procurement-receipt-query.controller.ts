import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProcurementReceiptQueryService } from './procurement-receipt-query.service';

@Controller('procurement/receipt-operations')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('inventory', 'read')
export class ProcurementReceiptQueryController {
  constructor(private readonly receipts: ProcurementReceiptQueryService) {}

  @Get('goods-receipts/:id')
  getReceiptDetail(@Param('id') id: string) {
    return this.receipts.getReceiptDetail(id);
  }
}
