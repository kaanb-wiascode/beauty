import { CrmAutomationService } from './crm-automation.service';

describe('CrmAutomationService', () => {
  const scope = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
  };

  function makeService() {
    const tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new CrmAutomationService(prisma as never);
    return { service, prisma, tx };
  }

  it('processes a scoped lead-created event into one automated follow-up', async () => {
    const { service, prisma, tx } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'event-1',
        eventType: 'LEAD_CREATED',
        branchId: 'branch-1',
        leadId: 'lead-1',
        opportunityId: null,
        actorUserId: 'creator-1',
        metadata: null,
      },
    ]);
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ownerUserId: 'owner-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'follow-up-1' }]);

    await expect(service.processPendingEvents(scope, 'actor-1')).resolves.toEqual({
      scanned: 1,
      created: 1,
      skipped: 0,
    });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("e.event_type IN ('LEAD_CREATED','OPPORTUNITY_STAGE_CHANGED')"),
      'tenant-1',
      'company-1',
      'branch-1',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      'tenant-1:company-1:branch-1:source-event:event-1',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("'AUTOMATION_EXECUTED'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      null,
      'follow-up-1',
      'actor-1',
      expect.stringContaining('LEAD_FIRST_TOUCH:lead-1'),
    );
  });

  it('skips an event that was processed while waiting for its source lock', async () => {
    const { service, prisma, tx } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'event-race',
        eventType: 'LEAD_CREATED',
        branchId: 'branch-1',
        leadId: 'lead-race',
        opportunityId: null,
        actorUserId: 'creator-1',
        metadata: null,
      },
    ]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'marker-1' }]);

    await expect(service.processPendingEvents(scope)).resolves.toEqual({
      scanned: 1,
      created: 0,
      skipped: 1,
    });

    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('skips follow-up creation when the automation key already exists', async () => {
    const { service, prisma, tx } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'event-2',
        eventType: 'LEAD_CREATED',
        branchId: 'branch-1',
        leadId: 'lead-2',
        opportunityId: null,
        actorUserId: 'creator-1',
        metadata: null,
      },
    ]);
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ownerUserId: 'owner-1' }])
      .mockResolvedValueOnce([{ id: 'automation-event' }]);

    await expect(service.processPendingEvents(scope, 'actor-1')).resolves.toEqual({
      scanned: 1,
      created: 0,
      skipped: 1,
    });

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("metadata->>'automationKey'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'LEAD_FIRST_TOUCH:lead-2',
    );
  });

  it('creates idempotent stale-opportunity tasks within explicit scope', async () => {
    const { service, prisma, tx } = makeService();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'opp-1',
        branchId: 'branch-1',
        ownerUserId: 'owner-1',
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'follow-up-1' }]);

    const result = await service.runStaleOpportunitySweep(scope, 14, 'actor-1');
    expect(result).toMatchObject({ scanned: 1, created: 1, skipped: 0, staleDays: 14 });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("stage NOT IN ('WON','LOST')"),
      'tenant-1',
      'company-1',
      'branch-1',
      expect.any(Date),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('STALE_OPPORTUNITY:opp-1:'),
    );
  });
});
