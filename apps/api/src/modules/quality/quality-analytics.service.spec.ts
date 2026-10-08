import { QualityAnalyticsService } from './quality-analytics.service';

describe('QualityAnalyticsService', () => {
  it('pre-aggregates branch signals per domain before joining branches', async () => {
    const query = jest.fn<Promise<any[]>, any[]>(async () => []);
    const prisma = { $queryRawUnsafe: query };
    const tenant = {
      getTenantId: () => 't1',
      getCompanyId: () => 'c1',
      getBranchId: () => null,
    };
    const service = new QualityAnalyticsService(prisma as any, tenant as any);

    await service.branchSignals(90);

    const call = query.mock.calls.at(0);
    expect(call).toBeDefined();
    const sql = call?.[0] as string;
    expect(sql).toContain('WITH findings AS');
    expect(sql).toContain('capas AS');
    expect(sql).toContain('inspections AS');
    expect(sql).toContain('ROUND(AVG(q.score)::numeric,2)');
    expect(sql).toContain('LEFT JOIN findings f ON f.branch_id=b.id');
    expect(sql).not.toContain('COUNT(DISTINCT q.id)');
  });
});
