import { TrainingBranchAnalyticsService } from './training-branch-analytics.service';

describe('TrainingBranchAnalyticsService', () => {
  it('keeps comparison signals inside tenant/company/branch scope', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) } as any;
    const tenant = {
      getContext: jest.fn(() => ({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        roleScope: 'BRANCH',
      })),
    } as any;

    const service = new TrainingBranchAnalyticsService(prisma, tenant);
    await service.branchSignals(90);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('($3::text IS NULL OR a.branch_id=$3::text)'),
      'tenant-1',
      'company-1',
      'branch-1',
      90,
    );
  });

  it('allows central context to compare company branches without inventing region scope', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) } as any;
    const tenant = {
      getContext: jest.fn(() => ({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: null,
        roleScope: 'CENTRAL',
      })),
    } as any;

    const service = new TrainingBranchAnalyticsService(prisma, tenant);
    await service.branchSignals(30);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'tenant-1',
      'company-1',
      null,
      30,
    );
  });
});
