import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { ServicesModule } from '../services/services.module';
import { StaffModule } from '../staff/staff.module';
import { ReportCsvGenerator } from './report-csv.generator';
import { ReportExportAuthorizationService } from './report-export-authorization.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportExportProcessorService } from './report-export-processor.service';
import { ReportExportStorageService } from './report-export-storage.service';
import { ReportExportWorkerContextService } from './report-export-worker-context.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [StaffModule, ServicesModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportExportJobsRepository,
    ReportExportAuthorizationService,
    ReportExportWorkerContextService,
    ReportExportStorageService,
    ReportExportProcessorService,
    ReportCsvGenerator,
  ],
  exports: [ReportsService, ReportExportProcessorService],
})
export class ReportsModule {}
