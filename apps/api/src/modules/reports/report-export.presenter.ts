import type { ReportExportJobRecord } from './report-export-jobs.repository';

export function toPublicReportExportJob(job: ReportExportJobRecord) {
  return {
    id: job.id,
    reportKey: job.reportKey,
    format: job.format,
    status: job.status,
    rowCount: job.rowCount,
    errorCode: job.errorCode,
    errorSummary: job.errorSummary,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
    updatedAt: job.updatedAt,
  };
}

export function toPublicReportExportList(result: {
  data: ReportExportJobRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}) {
  return {
    data: result.data.map(toPublicReportExportJob),
    meta: result.meta,
  };
}
