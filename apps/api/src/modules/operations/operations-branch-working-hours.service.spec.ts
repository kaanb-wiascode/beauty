import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';

describe('OperationsBranchWorkingHoursService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;

  beforeEach(() => queryRawUnsafe.mockReset());

  it('stays backward compatible when branch hours are not configured', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);
    const service = new OperationsBranchWorkingHoursService(prisma, tenantContext);
    const result = await service.check({
      startAt: new Date('2026-09-16T07:00:00.000Z'),
      endAt: new Date('2026-09-16T08:00:00.000Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.configured).toBe(false);
    expect(result.reason).toBe('BRANCH_HOURS_NOT_CONFIGURED');
  });

  it('blocks intervals outside a configured branch rule', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ count: 7 }])
      .mockResolvedValueOnce([{
        id: 'rule-1', weekday: 3, isClosed: false, opensAt: '09:00:00', closesAt: '18:00:00',
        crossesMidnight: false, timeZone: 'Europe/Istanbul', version: 1,
      }])
      .mockResolvedValueOnce([{ allowed: false }]);
    const service = new OperationsBranchWorkingHoursService(prisma, tenantContext);
    const result = await service.check({
      startAt: new Date('2026-09-16T04:00:00.000Z'),
      endAt: new Date('2026-09-16T05:00:00.000Z'),
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('OUTSIDE_BRANCH_HOURS');
  });
});
