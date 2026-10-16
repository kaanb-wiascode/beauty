import { reportComparisonSchema } from './report-comparison.dto';

describe('reportComparisonSchema', () => {
  it('accepts a strict report and date range', () => {
    expect(
      reportComparisonSchema.parse({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-07T23:59:59.999Z',
        },
      }),
    ).toEqual({
      reportKey: 'staff.performance',
      filters: {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2026-09-07T23:59:59.999Z'),
      },
    });
  });

  it('rejects scope overrides and arbitrary comparison ranges', () => {
    expect(() =>
      reportComparisonSchema.parse({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-07T23:59:59.999Z',
        },
        tenantId: 'tenant-2',
      }),
    ).toThrow();

    expect(() =>
      reportComparisonSchema.parse({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-07T23:59:59.999Z',
        },
        previous: {
          from: '2020-01-01T00:00:00.000Z',
          to: '2020-01-02T00:00:00.000Z',
        },
      }),
    ).toThrow();
  });
});
