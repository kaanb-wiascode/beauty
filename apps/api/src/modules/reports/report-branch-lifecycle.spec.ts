import { reportComparisonSchema } from './dto/report-comparison.dto';
import { reportExportSchema } from './dto/report-export.dto';
import { reportPreviewSchema } from './dto/report-preview.dto';
import { createReportSavedViewSchema } from './dto/report-saved-view.dto';
import { createReportScheduleSchema } from './dto/report-schedule.dto';
import { getReportDefinition, reportKeys } from './report-definition';

const filters = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.999Z'),
};

describe('branch performance report lifecycle', () => {
  it('is available through preview, comparison, export, saved views and schedules', () => {
    const reportKey = reportKeys.branchPerformance;
    const definition = getReportDefinition(reportKey);

    expect(definition).toBeDefined();
    expect(definition?.requiredPermissions).toEqual([
      { resource: 'reports', action: 'read' },
      { resource: 'appointments', action: 'read' },
    ]);
    expect(definition?.availableColumns).toEqual(
      expect.arrayContaining([
        'branchName',
        'appointmentCount',
        'completedCount',
        'cancelledCount',
        'noShowCount',
        'completionRate',
        'uniqueCustomerCount',
        'collected',
        'averageCollectedPerCompleted',
      ]),
    );
    expect(definition?.availableColumns).not.toContain('branchId');

    expect(reportPreviewSchema.parse({ reportKey, filters }).reportKey).toBe(
      reportKey,
    );
    expect(reportComparisonSchema.parse({ reportKey, filters }).reportKey).toBe(
      reportKey,
    );
    expect(
      reportExportSchema.parse({
        reportKey,
        format: 'CSV',
        filters,
        includeSummary: true,
        includeCharts: false,
      }).reportKey,
    ).toBe(reportKey);
    expect(
      createReportSavedViewSchema.parse({
        name: 'Şube performans görünümü',
        reportKey,
        filters,
        columns: [...(definition?.defaultColumns ?? [])],
      }).reportKey,
    ).toBe(reportKey);
    expect(
      createReportScheduleSchema.parse({
        name: 'Aylık şube performansı',
        reportKey,
        frequency: 'MONTHLY',
        timezone: 'Europe/Istanbul',
        localHour: 8,
        localMinute: 0,
        dayOfMonth: 1,
        format: 'XLSX',
        datePreset: 'PREVIOUS_MONTH',
        columns: [...(definition?.defaultColumns ?? [])],
        includeSummary: true,
      }).reportKey,
    ).toBe(reportKey);
  });
});
