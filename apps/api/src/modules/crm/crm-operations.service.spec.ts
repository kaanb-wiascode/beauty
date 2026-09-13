import { CrmOperationsService } from './crm-operations.service';

describe('CrmOperationsService', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getContext: jest.fn().mockReturnValue({
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId,
        roleScope: branchId ? 'BRANCH' : 'CENTRAL',
      }),
    } as never;
  }

  it('returns branch-scoped operational metrics, aging and owner workload', async () => {
    const dayStart = new Date('2026-09-13T21:00:00.000Z');
    const dayEnd = new Date('2026-09-14T21:00:00.000Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          newLeads: 4,
          openOpportunities: 7,
          weightedPipeline: 125000,
          overdueFollowUps: 2,
          todayFollowUps: 5,
          wonOpportunities: 3,
          lostOpportunities: 1,
          closing30Days: 4,
          forecast30Days: 80000,
          staleOpportunities: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          stage: 'PROPOSAL',
          count: 3,
          totalValue: 90000,
          weightedValue: 54000,
        },
      ])
      .mockResolvedValueOnce([
        { age0to7: 2, age8to14: 1, age15to30: 3, age31plus: 1 },
      ])
      .mockResolvedValueOnce([
        {
          ownerUserId: 'user-1',
          firstName: 'Ada',
          lastName: 'Yılmaz',
          email: 'ada@example.com',
          openOpportunityCount: 4,
          weightedValue: 70000,
          openFollowUpCount: 5,
          overdueFollowUpCount: 2,
        },
      ]);
    const service = new CrmOperationsService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(service.getSummary(dayStart, dayEnd)).resolves.toEqual({
      metrics: expect.objectContaining({
        openOpportunities: 7,
        todayFollowUps: 5,
        conversionRate: 75,
      }),
      pipeline: [expect.objectContaining({ stage: 'PROPOSAL', count: 3 })],
      aging: { age0to7: 2, age8to14: 1, age15to30: 3, age31plus: 1 },
      ownerWorkload: [
        expect.objectContaining({ ownerUserId: 'user-1', overdueFollowUpCount: 2 }),
      ],
    });

    expect(query).toHaveBeenCalledTimes(4);
    const metricSql = String(query.mock.calls[0][0]);
    expect(metricSql).toContain('l.tenant_id=$1::text');
    expect(metricSql).toContain('o.company_id=$2::text');
    expect(metricSql).toContain('f.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      dayStart,
      dayEnd,
    ]);

    for (const call of query.mock.calls.slice(1)) {
      expect(call.slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a']);
    }
  });
});
