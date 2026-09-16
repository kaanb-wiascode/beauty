import { ReportComparisonService } from './report-comparison.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH' as const,
};

describe('ReportComparisonService', () => {
  it('compares the selected period with the immediately preceding equal period', async () => {
    const reports = {
      preview: jest
        .fn()
        .mockResolvedValueOnce({
          meta: { summary: { collected: 1500, completedAppointments: 10 } },
        })
        .mockResolvedValueOnce({
          meta: { summary: { collected: 1000, completedAppointments: 8 } },
        }),
    } as any;
    const service = new ReportComparisonService(reports);

    const result = await service.compare(user, {
      reportKey: 'staff.performance',
      filters: {
        from: new Date('2026-09-08T00:00:00.000Z'),
        to: new Date('2026-09-14T23:59:59.999Z'),
      },
    });

    expect(reports.preview).toHaveBeenNthCalledWith(
      2,
      user,
      expect.objectContaining({
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-07T23:59:59.999Z'),
        },
      }),
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        {
          key: 'collected',
          current: 1500,
          previous: 1000,
          delta: 500,
          deltaPercent: 50,
        },
      ]),
    );
  });

  it('returns a null percentage when the previous value is zero', async () => {
    const reports = {
      preview: jest
        .fn()
        .mockResolvedValueOnce({ data: { net: 250 } })
        .mockResolvedValueOnce({ data: { net: 0 } }),
    } as any;
    const service = new ReportComparisonService(reports);

    const result = await service.compare(user, {
      reportKey: 'payments.summary',
      filters: {
        from: new Date('2026-09-15T00:00:00.000Z'),
        to: new Date('2026-09-15T23:59:59.999Z'),
      },
    });

    expect(result.metrics).toContainEqual({
      key: 'net',
      current: 250,
      previous: 0,
      delta: 250,
      deltaPercent: null,
    });
  });
});
