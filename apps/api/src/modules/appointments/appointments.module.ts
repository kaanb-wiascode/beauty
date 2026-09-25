import { Module } from '@nestjs/common';

import { AppointmentReportingService } from './appointment-reporting.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentReportingService],
  exports: [AppointmentsService, AppointmentReportingService],
})
export class AppointmentsModule {}
