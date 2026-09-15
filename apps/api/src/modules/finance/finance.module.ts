import { Module } from '@nestjs/common';
import { ExpenseAccountingController } from './expense-accounting.controller';
import { ExpenseAccountingService } from './expense-accounting.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceSetupController } from './finance-setup.controller';
import { FinanceSetupService } from './finance-setup.service';
import { IncomeRecordsController } from './income-records.controller';
import { IncomeRecordsService } from './income-records.service';

@Module({
  controllers: [
    ExpensesController,
    FinanceSetupController,
    ExpenseAccountingController,
    IncomeRecordsController,
  ],
  providers: [
    ExpensesService,
    FinanceSetupService,
    ExpenseAccountingService,
    IncomeRecordsService,
  ],
  exports: [
    ExpensesService,
    FinanceSetupService,
    ExpenseAccountingService,
    IncomeRecordsService,
  ],
})
export class FinanceModule {}
