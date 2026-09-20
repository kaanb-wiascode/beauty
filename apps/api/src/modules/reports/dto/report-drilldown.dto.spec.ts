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

  it('accepts bounded entity and appointment-day drilldowns', () => {
    expect(reportDrilldownSchema.parse(base)).toEqual(
      expect.objectContaining({
        reportKey: 'staff.performance',
        dimension: 'appointments',
        page: 1,
        limit: 25,
      }),
    );
    expect(
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'customers.performance',
      }),
    ).toEqual(
      expect.objectContaining({
        reportKey: 'customers.performance',
        dimension: 'appointments',
      }),
    );
    expect(
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'sales.performance',
        dimension: 'sale',
      }),
    ).toEqual(
      expect.objectContaining({
        reportKey: 'sales.performance',
        dimension: 'sale',
      }),
    );
    expect(
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'appointments.performance',
        rowId: '2026-09-15',
      }),
    ).toEqual(
      expect.objectContaining({
        reportKey: 'appointments.performance',
        rowId: '2026-09-15',
        dimension: 'appointments',
      }),
    );
    expect(
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'finance.performance',
        dimension: 'finance-records',
        rowId: '2026-09-15',
      }),
    ).toEqual(
      expect.objectContaining({
        reportKey: 'finance.performance',
        dimension: 'finance-records',
        rowId: '2026-09-15',
      }),
    );
    expect(
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'branches.performance',
      }),
    ).toEqual(
      expect.objectContaining({
        reportKey: 'branches.performance',
        dimension: 'appointments',
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
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'sales.performance',
        dimension: 'appointments',
      }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'staff.performance',
        dimension: 'sale',
      }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'appointments.performance',
        rowId: '2026-02-31',
      }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'finance.performance',
        dimension: 'appointments',
        rowId: '2026-09-15',
      }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'finance.performance',
        dimension: 'finance-records',
        rowId: '2026-02-31',
      }),
    ).toThrow();
    expect(() =>
      reportDrilldownSchema.parse({
        ...base,
        reportKey: 'staff.performance',
        rowId: '2026-09-15',
      }),
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
