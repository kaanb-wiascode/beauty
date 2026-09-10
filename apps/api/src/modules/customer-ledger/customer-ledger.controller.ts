import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CustomerLedgerService } from './customer-ledger.service';

@Controller('customer-ledger')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class CustomerLedgerController {
  constructor(private readonly customerLedgerService: CustomerLedgerService) {}

  @Get(':customerId')
  getCustomerLedger(@Param('customerId') customerId: string) {
    return this.customerLedgerService.getCustomerLedger(customerId);
  }
}
