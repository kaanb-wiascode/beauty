import { QualityBranchScoreAnalyticsService } from './quality-branch-score-analytics.service';

describe('QualityBranchScoreAnalyticsService', () => {
  it('reads persisted score state without recalculating and preserves branch scope', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) } as any;
    const tenant = {
      getContext: jest.fn(() => ({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        roleScope: 'BRANCH',
      })),
    } as any;

    const service = new QualityBranchScoreAnalyticsService(prisma, tenant);
    await service.latest();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('($3::text IS NULL OR s.branch_id=$3::text)'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });
});
