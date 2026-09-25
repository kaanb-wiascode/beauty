import { reportExportSchema } from './report-export.dto';
import { reportKeys } from '../report-definition';

describe('reportExportSchema', () => {
  const base = {
    reportKey: reportKeys.staffPerformance,
    format: 'XLSX' as const,
    filters: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    },
  };

  it('applies safe export option defaults', () => {
    const result = reportExportSchema.parse(base);

    expect(result.includeSummary).toBe(true);
    expect(result.includeCharts).toBe(false);
  });

  it('rejects arbitrary scope and storage fields', () => {
    for (const payload of [
      { ...base, branchId: 'branch-other' },
      { ...base, tenantId: 'tenant-other' },
      { ...base, storageKey: 'arbitrary/path' },
      { ...base, prismaSelect: { tenantId: true } },
    ]) {
      expect(() => reportExportSchema.parse(payload)).toThrow();
    }
  });

  it('rejects unsupported formats and report keys', () => {
    expect(() => reportExportSchema.parse({ ...base, format: 'HTML' })).toThrow();
    expect(() =>
      reportExportSchema.parse({ ...base, reportKey: 'arbitrary.sql.report' }),
    ).toThrow();
  });
});
