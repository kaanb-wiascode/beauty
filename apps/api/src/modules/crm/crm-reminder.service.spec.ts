import { CrmReminderService } from './crm-reminder.service';

describe('CrmReminderService', () => {
  function tenant() {
    return {
      getContext: jest.fn().mockReturnValue({
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId: 'branch-a',
        roleScope: 'BRANCH',
      }),
    } as never;
  }

  it('builds a mine-scoped reminder feed from follow-ups and opportunities', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'follow-up-1',
          opportunityId: 'opportunity-1',
          assignedUserId: 'user-1',
          channel: 'CALL',
          dueAt: new Date('2026-09-14T00:00:00.000Z'),
          note: null,
          version: 1,
          subjectLabel: 'Ada Yılmaz',
          kind: 'FOLLOW_UP_OVERDUE',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'opportunity-1',
          ownerUserId: 'user-1',
          title: 'Premium paket',
          stage: 'PROPOSAL',
          estimatedValue: 10000,
          currency: 'TRY',
          probability: 60,
          expectedCloseDate: new Date('2026-09-13T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
          subjectLabel: 'Ada Yılmaz',
          kind: 'OPPORTUNITY_CLOSE_OVERDUE',
        },
      ]);
    const service = new CrmReminderService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    const result = await service.getFeed({
      scope: 'MINE',
      userId: 'user-1',
      dayStart: new Date('2026-09-13T21:00:00.000Z'),
      dayEnd: new Date('2026-09-14T21:00:00.000Z'),
      today: '2026-09-14',
      closeThrough: '2026-09-21',
      staleBefore: new Date('2026-08-31T21:00:00.000Z'),
      limit: 50,
    });

    expect(result.counts).toEqual({ total: 2, critical: 2, high: 0, medium: 0 });
    expect(result.items[0]).toMatchObject({ severity: 'CRITICAL' });

    const followUpSql = String(query.mock.calls[0][0]);
    const opportunitySql = String(query.mock.calls[1][0]);
    expect(followUpSql).toContain('f.tenant_id=$1::text AND f.company_id=$2::text');
    expect(followUpSql).toContain('f.branch_id=$3::text');
    expect(followUpSql).toContain('f.assigned_user_id=$4::text');
    expect(opportunitySql).toContain('o.tenant_id=$1::text AND o.company_id=$2::text');
    expect(opportunitySql).toContain('o.branch_id=$3::text');
    expect(opportunitySql).toContain('o.owner_user_id=$4::text');
    expect(query.mock.calls[0][4]).toBe('user-1');
    expect(query.mock.calls[1][4]).toBe('user-1');
  });

  it('uses team scope without owner restriction', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmReminderService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await service.getFeed({
      scope: 'TEAM',
      userId: 'user-1',
      dayStart: new Date('2026-09-13T21:00:00.000Z'),
      dayEnd: new Date('2026-09-14T21:00:00.000Z'),
      today: '2026-09-14',
      closeThrough: '2026-09-21',
      staleBefore: new Date('2026-08-31T21:00:00.000Z'),
    });

    expect(query.mock.calls[0][4]).toBeNull();
    expect(query.mock.calls[1][4]).toBeNull();
  });
});
