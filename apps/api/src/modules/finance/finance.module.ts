import { Module } from '@nestjs/common';
import { ExpenseAccountingController } from './expense-accounting.controller';
import { ExpenseAccountingService } from './expense-accounting.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceSetupController } from './finance-setup.controller';
import { FinanceSetupService } from './finance-setup.service';

@Module({
  controllers: [ExpensesController, FinanceSetupController, ExpenseAccountingController],
  providers: [ExpensesService, FinanceSetupService, ExpenseAccountingService],
  exports: [ExpensesService, FinanceSetupService, ExpenseAccountingService],
})
export class FinanceModule {}
