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

describe('Finance report lifecycle contracts', () => {
  it('accepts finance performance through preview and comparison', () => {
    expect(
      reportPreviewSchema.parse({ reportKey: reportKeys.financePerformance, filters }).reportKey,
    ).toBe(reportKeys.financePerformance);
    expect(
      reportComparisonSchema.parse({ reportKey: reportKeys.financePerformance, filters }).reportKey,
    ).toBe(reportKeys.financePerformance);
  });

  it('accepts finance performance through export and personal history filters', () => {
    expect(
      reportExportSchema.parse({
        reportKey: reportKeys.financePerformance,
        format: 'XLSX',
        filters,
      }).reportKey,
    ).toBe(reportKeys.financePerformance);
    expect(
      reportExportListSchema.parse({
        reportKey: reportKeys.financePerformance,
        mine: 'true',
      }).reportKey,
    ).toBe(reportKeys.financePerformance);
  });

  it('accepts finance performance through saved reports and schedules', () => {
    expect(
      createReportSavedViewSchema.parse({
        name: 'Finans operasyon özeti',
        reportKey: reportKeys.financePerformance,
        filters,
        columns: ['date', 'incomeRecognized', 'expenseRecognized', 'netCashMovement'],
      }).reportKey,
    ).toBe(reportKeys.financePerformance);

    expect(
      createReportScheduleSchema.parse({
        name: 'Aylık finans operasyon özeti',
        reportKey: reportKeys.financePerformance,
        frequency: 'MONTHLY',
        timezone: 'Europe/Istanbul',
        localHour: 8,
        localMinute: 0,
        dayOfMonth: 1,
        format: 'XLSX',
        datePreset: 'PREVIOUS_MONTH',
        columns: ['date', 'incomeRecognized', 'expenseRecognized', 'netCashMovement'],
        includeSummary: true,
      }).reportKey,
    ).toBe(reportKeys.financePerformance);
  });
});
