import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { BusinessPolicyModule } from '../business-policies/business-policy.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [BusinessPolicyModule, AccountingModule, FinanceModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
