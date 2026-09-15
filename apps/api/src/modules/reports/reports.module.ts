import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../../common/storage/object-storage.module';
import { PaymentsModule } from '../payments/payments.module';
import { ServicesModule } from '../services/services.module';
import { StaffModule } from '../staff/staff.module';
import { ReportCsvGenerator } from './report-csv.generator';
import { ReportExportAuthorizationService } from './report-export-authorization.service';
import { ReportExportDownloadService } from './report-export-download.service';
import { ReportExportExpiryRepository } from './report-export-expiry.repository';
import { ReportExportExpiryService } from './report-export-expiry.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportExportProcessorService } from './report-export-processor.service';
import { ReportExportStaleRepository } from './report-export-stale.repository';
import { ReportExportStaleService } from './report-export-stale.service';
import { ReportExportStorageService } from './report-export-storage.service';
import { ReportExportWorkerContextService } from './report-export-worker-context.service';
import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ObjectStorageModule, StaffModule, ServicesModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportExportJobsRepository,
    ReportExportExpiryRepository,
    ReportExportStaleRepository,
    ReportExportAuthorizationService,
    ReportExportWorkerContextService,
    ReportExportStorageService,
    ReportExportExpiryService,
    ReportExportStaleService,
    ReportExportProcessorService,
    ReportExportWorkerRunnerService,
    ReportExportDownloadService,
    ReportCsvGenerator,
  ],
  exports: [ReportsService, ReportExportProcessorService],
})
export class ReportsModule {}
