import { Module } from '@nestjs/common';
import { ExpenseAccountingController } from './expense-accounting.controller';
import { ExpenseAccountingService } from './expense-accounting.service';
import { ExpensePaymentsController } from './expense-payments.controller';
import { ExpensePaymentsService } from './expense-payments.service';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { FinanceSetupController } from './finance-setup.controller';
import { FinanceSetupService } from './finance-setup.service';
import { IncomeAccountingController } from './income-accounting.controller';
import { IncomeAccountingService } from './income-accounting.service';
import { IncomeCollectionsController } from './income-collections.controller';
import { IncomeCollectionsService } from './income-collections.service';
import { IncomeRecordsController } from './income-records.controller';
import { IncomeRecordsService } from './income-records.service';

@Module({
  controllers: [
    ExpensesController,
    FinanceSetupController,
    ExpenseAccountingController,
    ExpensePaymentsController,
    IncomeRecordsController,
    IncomeAccountingController,
    IncomeCollectionsController,
  ],
  providers: [
    ExpensesService,
    FinanceSetupService,
    ExpenseAccountingService,
    ExpensePaymentsService,
    IncomeRecordsService,
    IncomeAccountingService,
    IncomeCollectionsService,
  ],
  exports: [
    ExpensesService,
    FinanceSetupService,
    ExpenseAccountingService,
    ExpensePaymentsService,
    IncomeRecordsService,
    IncomeAccountingService,
    IncomeCollectionsService,
  ],
})
export class FinanceModule {}
