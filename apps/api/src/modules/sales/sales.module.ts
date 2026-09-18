import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InstallmentsModule } from '../installments/installments.module';
import { TaxModule } from '../tax/tax.module';
import { SalesController } from './sales.controller';
import { SalesReportingService } from './sales-reporting.service';
import { SalesService } from './sales.service';

@Module({
  imports: [InstallmentsModule, AccountingModule, TaxModule],
  controllers: [SalesController],
  providers: [SalesService, SalesReportingService],
  exports: [SalesService, SalesReportingService],
})
export class SalesModule {}
