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

describe('Customer report lifecycle contracts', () => {
  it('accepts customer performance through preview and comparison', () => {
    expect(
      reportPreviewSchema.parse({
        reportKey: reportKeys.customerPerformance,
        filters,
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);

    expect(
      reportComparisonSchema.parse({
        reportKey: reportKeys.customerPerformance,
        filters,
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);
  });

  it('accepts customer performance through export and personal history filters', () => {
    expect(
      reportExportSchema.parse({
        reportKey: reportKeys.customerPerformance,
        format: 'XLSX',
        filters,
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);

    expect(
      reportExportListSchema.parse({
        reportKey: reportKeys.customerPerformance,
        mine: 'true',
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);
  });

  it('accepts customer performance through saved reports and schedules', () => {
    expect(
      createReportSavedViewSchema.parse({
        name: 'Müşteri performansı',
        reportKey: reportKeys.customerPerformance,
        filters,
        columns: ['name', 'visitCount', 'collected'],
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);

    expect(
      createReportScheduleSchema.parse({
        name: 'Aylık müşteri performansı',
        reportKey: reportKeys.customerPerformance,
        frequency: 'MONTHLY',
        timezone: 'Europe/Istanbul',
        localHour: 8,
        localMinute: 0,
        dayOfMonth: 1,
        format: 'PDF',
        datePreset: 'PREVIOUS_MONTH',
        columns: ['name', 'visitCount', 'collected'],
        includeSummary: true,
      }).reportKey,
    ).toBe(reportKeys.customerPerformance);
  });
});
