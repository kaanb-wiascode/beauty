import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceSetupController } from './finance-setup.controller';
import { FinanceSetupService } from './finance-setup.service';

@Module({
  controllers: [ExpensesController, FinanceSetupController],
  providers: [ExpensesService, FinanceSetupService],
  exports: [ExpensesService, FinanceSetupService],
})
export class FinanceModule {}
