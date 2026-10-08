import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { reportExportSchema } from './dto/report-export.dto';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportExportStorageService } from './report-export-storage.service';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportExportDownloadService {
  constructor(
    private readonly jobs: ReportExportJobsRepository,
    private readonly reports: ReportsService,
    private readonly storage: ReportExportStorageService,
  ) {}

  async download(user: JwtPayload, id: string) {
    const job = await this.jobs.findById(user, id);
    if (!job) {
      throw new NotFoundException('Report export job not found');
    }

    if (job.requestedBy !== user.sub) {
      throw new ForbiddenException(
        'Only the export requester can download this artifact',
      );
    }

    if (job.status !== 'READY' || !job.storageKey) {
      throw new NotFoundException('Report export artifact is not ready');
    }

    if (!job.expiresAt || job.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Report export artifact has expired');
    }

    const input = reportExportSchema.parse({
      reportKey: job.reportKey,
      format: job.format,
      filters: job.filters,
      columns: job.columns,
      sort: job.sort ?? undefined,
      includeSummary: job.includeSummary,
      includeCharts: job.includeCharts,
    });

    await this.reports.prepareExport(user, input);

    return {
      content: await this.storage.read(job.storageKey),
      contentType: this.contentType(job.format),
      fileName: this.fileName(job.reportKey, job.format, job.id),
    };
  }

  private contentType(format: string) {
    if (format === 'CSV') return 'text/csv; charset=utf-8';
    if (format === 'XLSX') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'application/pdf';
  }

  private fileName(reportKey: string, format: string, id: string) {
    const safeReportKey = reportKey.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const extension = format.toLowerCase();
    return `${safeReportKey}-${id}.${extension}`;
  }
}
