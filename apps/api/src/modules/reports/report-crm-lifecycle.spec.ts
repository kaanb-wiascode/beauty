import { reportComparisonSchema } from './dto/report-comparison.dto';
import { reportExportSchema } from './dto/report-export.dto';
import { reportExportListSchema } from './dto/report-export-list.dto';
import { reportPreviewSchema } from './dto/report-preview.dto';
import { createReportSavedViewSchema } from './dto/report-saved-view.dto';
import { createReportScheduleSchema } from './dto/report-schedule.dto';
import { getReportDefinition, reportKeys } from './report-definition';

describe('CRM reporting lifecycle contract', () => {
  const filters = { from: new Date('2026-09-01'), to: new Date('2026-09-15') };

  it('is registered with reports.read + crm.read', () => {
    expect(getReportDefinition(reportKeys.crmPerformance)).toMatchObject({
      key: 'crm.performance',
      requiredPermissions: [
        { resource: 'reports', action: 'read' },
        { resource: 'crm', action: 'read' },
      ],
    });
  });

  it('supports preview comparison export history saved views and schedules', () => {
    expect(reportPreviewSchema.parse({ reportKey: 'crm.performance', filters }).reportKey).toBe('crm.performance');
    expect(reportComparisonSchema.parse({ reportKey: 'crm.performance', filters }).reportKey).toBe('crm.performance');
    expect(reportExportSchema.parse({ reportKey: 'crm.performance', format: 'CSV', filters }).reportKey).toBe('crm.performance');
    expect(reportExportListSchema.parse({ reportKey: 'crm.performance' }).reportKey).toBe('crm.performance');
    expect(createReportSavedViewSchema.parse({
      name: 'CRM görünümü', reportKey: 'crm.performance', filters, columns: ['date','leadCount'],
    }).reportKey).toBe('crm.performance');
    expect(createReportScheduleSchema.parse({
      name: 'CRM haftalık', reportKey: 'crm.performance', frequency: 'WEEKLY', timezone: 'Europe/Istanbul',
      localHour: 9, localMinute: 0, dayOfWeek: 1, format: 'XLSX', datePreset: 'LAST_7_DAYS',
      columns: ['date','leadCount','convertedCount'],
    }).reportKey).toBe('crm.performance');
  });
});
