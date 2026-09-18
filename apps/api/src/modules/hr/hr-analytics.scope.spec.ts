import { HrAnalyticsService } from './hr-analytics.service';

describe('HrAnalyticsService organization scope', () => {
  const query = jest.fn();
  const prisma = { $queryRawUnsafe: query } as any;
  const tenant = {
    getCompanyId: jest.fn().mockReturnValue('company-a'),
  } as any;
  const organizationScope = {
    getBranchScopedWhere: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([]);
  });

  it('limits COMPANY analytics to assigned branches when no branch is selected', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
    const service = new HrAnalyticsService(prisma, tenant, organizationScope);

    await service.summary(2026, 9);

    expect(query).toHaveBeenCalledTimes(4);
    expect(String(query.mock.calls[0][0])).toContain(
      's."branchId"=ANY($3::text[])',
    );
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      ['branch-a', 'branch-b'],
    ]);
    expect(String(query.mock.calls[3][0])).toContain(
      'branch_id=ANY($5::text[])',
    );
    expect(String(query.mock.calls[3][0])).not.toContain('branch_id IS NULL');
    expect(query.mock.calls[3].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      2026,
      9,
      ['branch-a', 'branch-b'],
    ]);
  });

  it('keeps CENTRAL company-wide analytics represented by a null branch list', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branch: { companyId: 'company-a' },
    });
    const service = new HrAnalyticsService(prisma, tenant, organizationScope);

    await service.summary(2026, 9);

    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      null,
    ]);
    expect(query.mock.calls[1].slice(1)).toEqual([
      'tenant-a',
      2026,
      9,
      null,
    ]);
  });

  it('uses the selected branch as an exact one-item scope', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: 'branch-a',
    });
    const service = new HrAnalyticsService(prisma, tenant, organizationScope);

    await service.summary(2026, 9);

    expect(query.mock.calls[2].slice(1)).toEqual([
      'tenant-a',
      2026,
      9,
      ['branch-a'],
    ]);
  });
});
