import { reportComparisonSchema } from './report-comparison.dto';
import { reportExportListSchema } from './report-export-list.dto';
import { reportExportSchema } from './report-export.dto';
import { reportPreviewSchema } from './report-preview.dto';
import { createReportSavedViewSchema } from './report-saved-view.dto';
import { createReportScheduleSchema } from './report-schedule.dto';
import { reportKeys } from '../report-definition';

const filters = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-30T23:59:59.999Z',
};

describe('Sales report lifecycle contracts', () => {
  it('accepts sales performance through preview and comparison', () => {
    expect(reportPreviewSchema.parse({ reportKey: reportKeys.salesPerformance, filters }).reportKey)
      .toBe(reportKeys.salesPerformance);
    expect(reportComparisonSchema.parse({ reportKey: reportKeys.salesPerformance, filters }).reportKey)
      .toBe(reportKeys.salesPerformance);
  });

  it('accepts sales performance through export and personal history filters', () => {
    expect(reportExportSchema.parse({ reportKey: reportKeys.salesPerformance, format: 'XLSX', filters }).reportKey)
      .toBe(reportKeys.salesPerformance);
    expect(reportExportListSchema.parse({ reportKey: reportKeys.salesPerformance, mine: 'true' }).reportKey)
      .toBe(reportKeys.salesPerformance);
  });

  it('accepts sales performance through saved reports and schedules', () => {
    expect(createReportSavedViewSchema.parse({
      name: 'Satış performansı',
      reportKey: reportKeys.salesPerformance,
      filters,
      columns: ['confirmedAt', 'customerName', 'revenue', 'collected'],
    }).reportKey).toBe(reportKeys.salesPerformance);

    expect(createReportScheduleSchema.parse({
      name: 'Aylık satış performansı',
      reportKey: reportKeys.salesPerformance,
      frequency: 'MONTHLY',
      timezone: 'Europe/Istanbul',
      localHour: 8,
      localMinute: 0,
      dayOfMonth: 1,
      format: 'XLSX',
      datePreset: 'PREVIOUS_MONTH',
      columns: ['confirmedAt', 'customerName', 'revenue', 'collected'],
      includeSummary: true,
    }).reportKey).toBe(reportKeys.salesPerformance);
  });
});
