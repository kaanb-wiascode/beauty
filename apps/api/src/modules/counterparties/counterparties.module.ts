import { Module } from '@nestjs/common';
import { AccountsPayableModule } from '../accounts-payable/accounts-payable.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CounterpartiesController } from './counterparties.controller';
import { CounterpartiesService } from './counterparties.service';

@Module({
  imports: [CustomerLedgerModule, AccountsPayableModule],
  controllers: [CounterpartiesController],
  providers: [CounterpartiesService],
  exports: [CounterpartiesService],
})
export class CounterpartiesModule {}
