import { reportComparisonSchema } from './dto/report-comparison.dto';
import { reportExportSchema } from './dto/report-export.dto';
import { reportExportListSchema } from './dto/report-export-list.dto';
import { reportPreviewSchema } from './dto/report-preview.dto';
import { createReportSavedViewSchema } from './dto/report-saved-view.dto';
import { createReportScheduleSchema } from './dto/report-schedule.dto';
import { getReportDefinition, reportKeys } from './report-definition';

describe('HR and payroll reporting lifecycle', () => {
  const filters = { from: new Date('2026-09-01'), to: new Date('2026-09-30') };

  it('keeps workforce and payroll permission boundaries separate', () => {
    expect(getReportDefinition(reportKeys.hrWorkforce)?.requiredPermissions).toEqual([
      { resource: 'reports', action: 'read' },
      { resource: 'hr', action: 'read' },
    ]);
    expect(getReportDefinition(reportKeys.payrollSummary)?.requiredPermissions).toEqual([
      { resource: 'reports', action: 'read' },
      { resource: 'hr', action: 'read' },
      { resource: 'hr_sensitive', action: 'read' },
    ]);
  });

  it.each(['hr.workforce', 'payroll.summary'] as const)('supports the full lifecycle for %s', (reportKey) => {
    expect(reportPreviewSchema.parse({ reportKey, filters }).reportKey).toBe(reportKey);
    expect(reportComparisonSchema.parse({ reportKey, filters }).reportKey).toBe(reportKey);
    expect(reportExportSchema.parse({ reportKey, format: 'CSV', filters }).reportKey).toBe(reportKey);
    expect(reportExportListSchema.parse({ reportKey }).reportKey).toBe(reportKey);
    expect(createReportSavedViewSchema.parse({ name: 'Görünüm', reportKey, filters, columns: [reportKey === 'hr.workforce' ? 'date' : 'periodDate'] }).reportKey).toBe(reportKey);
    expect(createReportScheduleSchema.parse({
      name: 'Aylık rapor', reportKey, frequency: 'MONTHLY', timezone: 'Europe/Istanbul', localHour: 9, localMinute: 0,
      dayOfMonth: 1, format: 'XLSX', datePreset: 'PREVIOUS_MONTH', columns: [reportKey === 'hr.workforce' ? 'date' : 'periodDate'],
    }).reportKey).toBe(reportKey);
  });
});
