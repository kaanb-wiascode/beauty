import { Module } from '@nestjs/common';
import { CustomerLedgerController } from './customer-ledger.controller';
import { CustomerLedgerService } from './customer-ledger.service';

@Module({
  controllers: [CustomerLedgerController],
  providers: [CustomerLedgerService],
  exports: [CustomerLedgerService],
})
export class CustomerLedgerModule {}
