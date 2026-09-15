import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { ServicesModule } from '../services/services.module';
import { StaffModule } from '../staff/staff.module';
import { ReportCsvGenerator } from './report-csv.generator';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [StaffModule, ServicesModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportJobsRepository, ReportCsvGenerator],
  exports: [ReportsService],
})
export class ReportsModule {}
