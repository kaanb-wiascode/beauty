import { PayrollDashboardService } from './payroll-dashboard.service';

describe('PayrollDashboardService organization scope', () => {
  const tenant = { getCompanyId: () => 'company-1' } as never;

  it('passes assigned company branches to every dashboard query', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: { in: ['branch-a', 'branch-b'] },
      }),
    } as never;
    const service = new PayrollDashboardService(prisma, tenant, organizationScope);

    await service.summary(2026, 9);

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][3]).toEqual(['branch-a', 'branch-b']);
    for (const call of query.mock.calls.slice(1)) {
      expect(call[5]).toEqual(['branch-a', 'branch-b']);
      expect(String(call[0])).toContain('ANY($5::text[])');
    }
  });

  it('represents central company-wide access with a null branch list', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branch: { companyId: 'company-1' },
      }),
    } as never;
    const service = new PayrollDashboardService(prisma, tenant, organizationScope);

    await service.summary(2026, 9);

    expect(query.mock.calls[0][3]).toBeNull();
    for (const call of query.mock.calls.slice(1)) {
      expect(call[5]).toBeNull();
    }
  });
});
