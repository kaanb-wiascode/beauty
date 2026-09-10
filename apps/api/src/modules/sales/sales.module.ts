import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InstallmentsModule } from '../installments/installments.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [InstallmentsModule, AccountingModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
