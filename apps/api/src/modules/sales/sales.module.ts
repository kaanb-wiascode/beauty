import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InstallmentsModule } from '../installments/installments.module';
import { TaxModule } from '../tax/tax.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [InstallmentsModule, AccountingModule, TaxModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
