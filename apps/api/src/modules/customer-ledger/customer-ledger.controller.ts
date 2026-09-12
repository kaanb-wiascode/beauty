import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CustomerLedgerService } from './customer-ledger.service';

@Controller('customer-ledger')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class CustomerLedgerController {
  constructor(private readonly customerLedgerService: CustomerLedgerService) {}

  @Get(':customerId')
  getCustomerLedger(@Param('customerId') customerId: string) {
    return this.customerLedgerService.getCustomerLedger(customerId);
  }
}
