import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { AccountsPayableController } from './accounts-payable.controller';
import { AccountsPayableService } from './accounts-payable.service';
import { AccountsPayableReversalsService } from './accounts-payable-reversals.service';
import { AccountsPayableCreditAnalyticsService } from './accounts-payable-credit-analytics.service';

@Module({
  imports: [FinanceModule],
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService, AccountsPayableReversalsService, AccountsPayableCreditAnalyticsService],
  exports: [AccountsPayableService, AccountsPayableReversalsService, AccountsPayableCreditAnalyticsService],
})
export class AccountsPayableModule {}
