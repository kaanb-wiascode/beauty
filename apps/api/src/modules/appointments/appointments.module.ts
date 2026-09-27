import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { FinanceModule } from '../finance/finance.module';

import { AppointmentReportingService } from './appointment-reporting.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AccountingModule, FinanceModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentReportingService],
  exports: [AppointmentsService, AppointmentReportingService],
})
export class AppointmentsModule {}
