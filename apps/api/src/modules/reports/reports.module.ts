import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../../common/storage/object-storage.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentsModule } from '../payments/payments.module';
import { SalesModule } from '../sales/sales.module';
import { ServicesModule } from '../services/services.module';
import { StaffModule } from '../staff/staff.module';
import { ReportComparisonService } from './report-comparison.service';
import { ReportCsvGenerator } from './report-csv.generator';
import { ReportDrilldownService } from './report-drilldown.service';
import { ReportExportAuthorizationService } from './report-export-authorization.service';
import { ReportExportBrandingService } from './report-export-branding.service';
import { ReportExportDownloadService } from './report-export-download.service';
import { ReportExportExpiryRepository } from './report-export-expiry.repository';
import { ReportExportExpiryService } from './report-export-expiry.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportExportPolicyService } from './report-export-policy.service';
import { ReportExportProcessorService } from './report-export-processor.service';
import { ReportExportStaleRepository } from './report-export-stale.repository';
import { ReportExportStaleService } from './report-export-stale.service';
import { ReportExportStorageService } from './report-export-storage.service';
import { ReportExportWorkerContextService } from './report-export-worker-context.service';
import { ReportExportWorkerRunnerService } from './report-export-worker-runner.service';
import { ReportPdfGenerator } from './report-pdf.generator';
import { ReportSavedViewsRepository } from './report-saved-views.repository';
import { ReportSavedViewsService } from './report-saved-views.service';
import { ReportScheduleExecutionService } from './report-schedule-execution.service';
import { ReportScheduleRunsRepository } from './report-schedule-runs.repository';
import { ReportSchedulesRepository } from './report-schedules.repository';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportXlsxGenerator } from './report-xlsx.generator';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ObjectStorageModule, AppointmentsModule, CustomersModule, SalesModule, StaffModule, ServicesModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService, ReportComparisonService, ReportDrilldownService,
    ReportExportJobsRepository, ReportSavedViewsRepository, ReportSavedViewsService,
    ReportSchedulesRepository, ReportSchedulesService, ReportScheduleRunsRepository,
    ReportScheduleExecutionService, ReportExportExpiryRepository, ReportExportStaleRepository,
    ReportExportAuthorizationService, ReportExportBrandingService, ReportExportPolicyService,
    ReportExportWorkerContextService, ReportExportStorageService, ReportExportExpiryService,
    ReportExportStaleService, ReportExportProcessorService, ReportExportWorkerRunnerService,
    ReportExportDownloadService, ReportCsvGenerator, ReportXlsxGenerator, ReportPdfGenerator,
  ],
  exports: [ReportsService, ReportExportProcessorService],
})
export class ReportsModule {}
