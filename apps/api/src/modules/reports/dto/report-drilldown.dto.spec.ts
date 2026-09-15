import { reportDrilldownSchema } from './report-drilldown.dto';

describe('reportDrilldownSchema', () => {
  const base = {
    reportKey: 'staff.performance',
    dimension: 'appointments',
    rowId: '11111111-1111-4111-8111-111111111111',
    filters: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    },
  };

  it('accepts a bounded staff appointment drilldown', () => {
    expect(reportDrilldownSchema.parse(base)).toEqual(
      expect.objectContaining({
        reportKey: 'staff.performance',
        dimension: 'appointments',
        page: 1,
        limit: 25,
      }),
    );
  });

  it('rejects unsupported report and dimensions', () => {
    expect(() =>
      reportDrilldownSchema.parse({ ...base, reportKey: 'payments.summary' }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({ ...base, dimension: 'sql' }),
    ).toThrow();
  });

  it('rejects arbitrary scope and query controls', () => {
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        tenantId: 'tenant-other',
        branchId: 'branch-other',
        prismaSelect: { customer: true },
      }),
    ).toThrow();
  });
});
