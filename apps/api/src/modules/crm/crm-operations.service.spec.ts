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

  it('lists overdue follow-ups inside scope and owner filter', async () => {
    const dayStart = new Date('2026-09-13T21:00:00.000Z');
    const dayEnd = new Date('2026-09-14T21:00:00.000Z');
    const query = jest.fn().mockResolvedValue([{ id: 'follow-up-1' }]);
    const service = new CrmOperationsService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(
      service.listActionFollowUps({
        mode: 'OVERDUE',
        dayStart,
        dayEnd,
        assignedUserId: 'user-1',
        limit: 25,
      }),
    ).resolves.toEqual([{ id: 'follow-up-1' }]);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('f.tenant_id=$1::text AND f.company_id=$2::text');
    expect(sql).toContain('f.branch_id=$3::text');
    expect(sql).toContain('f.assigned_user_id=$4::text');
    expect(sql).toContain("$5::text='OVERDUE'");
    expect(sql).toContain("$5::text='TODAY'");
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      'user-1',
      'OVERDUE',
      dayStart,
      dayEnd,
      25,
    ]);
  });

  it('lists stale opportunities inside scope and owner filter', async () => {
    const staleBefore = new Date('2026-08-31T00:00:00.000Z');
    const query = jest.fn().mockResolvedValue([{ id: 'opportunity-1' }]);
    const service = new CrmOperationsService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(
      service.listStaleOpportunities({
        ownerUserId: 'user-1',
        staleBefore,
        limit: 40,
      }),
    ).resolves.toEqual([{ id: 'opportunity-1' }]);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('o.tenant_id=$1::text AND o.company_id=$2::text');
    expect(sql).toContain('o.branch_id=$3::text');
    expect(sql).toContain('o.owner_user_id=$4::text');
    expect(sql).toContain("o.stage NOT IN ('WON','LOST')");
    expect(sql).toContain('o.updated_at < $5::timestamptz');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      'user-1',
      staleBefore,
      40,
    ]);
  });
});
