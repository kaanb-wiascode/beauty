import { TrainingAnalyticsService } from './training-analytics.service';

describe('TrainingAnalyticsService', () => {
  const tenant = {
    getContext: jest.fn(() => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    })),
  } as any;

  it('normalizes overview aggregates and preserves compliance trend', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          { total: 10, completed: 7, open: 2, expired: 1, overdue: 1, completion_rate: '70.00' },
        ])
        .mockResolvedValueOnce([{ open: 3, overdue: 1, completed: 4 }])
        .mockResolvedValueOnce([{ requirements: 12, gaps: 3, profiled_staff: 5, average_score: '78.50' }])
        .mockResolvedValueOnce([
          { periodStart: '2026-08-01', periodEnd: '2026-08-31', trainingCompliance: 82, qualityScore: 88, sourceCount: 10 },
        ]),
    } as any;

    const service = new TrainingAnalyticsService(prisma, tenant);
    const result = await service.overview(90);

    expect(result.assignments).toEqual({
      total: 10,
      completed: 7,
      open: 2,
      expired: 1,
      overdue: 1,
      completionRate: 70,
    });
    expect(result.competency).toEqual({
      requirements: 12,
      gaps: 3,
      profiledStaff: 5,
      averageScore: 78.5,
    });
    expect(result.complianceTrend).toHaveLength(1);
  });

  it('keeps staff risk query branch scoped', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) } as any;
    const service = new TrainingAnalyticsService(prisma, tenant);

    await service.staffRisk(25);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('($3::text IS NULL OR scp.branch_id=$3::text)'),
      'tenant-1',
      'company-1',
      'branch-1',
      25,
    );
  });
});
