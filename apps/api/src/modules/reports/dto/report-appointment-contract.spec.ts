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

describe('Appointment report lifecycle contracts', () => {
  it('accepts appointment performance through preview and comparison', () => {
    expect(
      reportPreviewSchema.parse({
        reportKey: reportKeys.appointmentPerformance,
        filters,
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);

    expect(
      reportComparisonSchema.parse({
        reportKey: reportKeys.appointmentPerformance,
        filters,
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);
  });

  it('accepts appointment performance through export and history filters', () => {
    expect(
      reportExportSchema.parse({
        reportKey: reportKeys.appointmentPerformance,
        format: 'XLSX',
        filters,
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);

    expect(
      reportExportListSchema.parse({
        reportKey: reportKeys.appointmentPerformance,
        mine: 'true',
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);
  });

  it('accepts appointment performance through saved reports and schedules', () => {
    expect(
      createReportSavedViewSchema.parse({
        name: 'Randevu performansı',
        reportKey: reportKeys.appointmentPerformance,
        filters,
        columns: ['date', 'appointmentCount', 'completionRate'],
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);

    expect(
      createReportScheduleSchema.parse({
        name: 'Haftalık randevu performansı',
        reportKey: reportKeys.appointmentPerformance,
        frequency: 'WEEKLY',
        timezone: 'Europe/Istanbul',
        localHour: 8,
        localMinute: 0,
        dayOfWeek: 1,
        format: 'PDF',
        datePreset: 'LAST_7_DAYS',
        columns: ['date', 'appointmentCount', 'completionRate'],
        includeSummary: true,
      }).reportKey,
    ).toBe(reportKeys.appointmentPerformance);
  });
});
