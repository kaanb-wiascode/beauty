import { Module } from '@nestjs/common';
import { AccountsPayableController } from './accounts-payable.controller';
import { AccountsPayableService } from './accounts-payable.service';
import { AccountsPayableReversalsService } from './accounts-payable-reversals.service';

@Module({
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService, AccountsPayableReversalsService],
  exports: [AccountsPayableService, AccountsPayableReversalsService],
})
export class AccountsPayableModule {}
