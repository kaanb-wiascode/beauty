import { reportPreviewSchema } from './report-preview.dto';
import { reportKeys } from '../report-definition';

describe('reportPreviewSchema', () => {
  const base = {
    reportKey: reportKeys.staffPerformance,
    filters: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    },
  };

  it('applies bounded pagination defaults', () => {
    const result = reportPreviewSchema.parse(base);

    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
  });

  it('rejects arbitrary top-level query fields', () => {
    expect(() =>
      reportPreviewSchema.parse({
        ...base,
        prismaSelect: { tenantId: true },
      }),
    ).toThrow();
  });

  it('rejects limits above the server maximum', () => {
    expect(() =>
      reportPreviewSchema.parse({
        ...base,
        limit: 101,
      }),
    ).toThrow();
  });

  it('rejects unsupported report keys before dispatch', () => {
    expect(() =>
      reportPreviewSchema.parse({
        ...base,
        reportKey: 'arbitrary.sql.report',
      }),
    ).toThrow();
  });
});
