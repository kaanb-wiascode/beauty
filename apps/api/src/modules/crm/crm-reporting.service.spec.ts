import { CrmReportingService } from './crm-reporting.service';

describe('CrmReportingService', () => {
  it('uses authenticated tenant company branch scope and normalizes metrics', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        date: new Date('2026-09-15T00:00:00.000Z'),
        leadCount: 10,
        contactedCount: 5,
        qualifiedCount: 4,
        convertedCount: 3,
        lostLeadCount: 2,
        opportunityCount: 5,
        openOpportunityCount: 2,
        wonCount: 2,
        lostOpportunityCount: 1,
        pipelineValue: '12500.50',
        wonValue: '5000.25',
      },
    ]);
    const service = new CrmReportingService(
      { $queryRawUnsafe: queryRaw } as never,
      {
        getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' }),
      } as never,
    );

    const result = await service.performance({
      from: new Date('2026-09-15T00:00:00.000Z'),
      to: new Date('2026-09-15T23:59:59.999Z'),
    });

    expect(queryRaw).toHaveBeenCalledWith(
      expect.any(String),
      'tenant-1',
      'company-1',
      'branch-1',
      expect.any(Date),
      expect.any(Date),
    );
    const sql = queryRaw.mock.calls[0]?.[0] as string;
    expect(sql).toContain("COUNT(*) FILTER (WHERE o.stage NOT IN ('WON','LOST'))");
    expect(sql).toContain("SUM(CASE WHEN o.stage NOT IN ('WON','LOST')");
    expect(result[0]).toMatchObject({
      leadCount: 10,
      convertedCount: 3,
      leadConversionRate: 30,
      opportunityCount: 5,
      openOpportunityCount: 2,
      wonCount: 2,
      winRate: 40,
      pipelineValue: 12500.5,
      wonValue: 5000.25,
    });
  });
});
