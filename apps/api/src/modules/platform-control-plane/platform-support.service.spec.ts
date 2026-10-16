import { ConflictException } from '@nestjs/common';

import { PlatformSupportService } from './platform-support.service';

describe('PlatformSupportService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const audit = { record: jest.fn() };
  const service = new PlatformSupportService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    audit.record.mockResolvedValue(undefined);
  });

  it('does not allow a closed support ticket to be reopened', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: 'ticket-1',
        tenantId: 'tenant-1',
        subject: 'Closed issue',
        description: null,
        priority: 'MEDIUM',
        status: 'CLOSED',
        source: 'PLATFORM',
        requesterEmail: null,
        assignedPlatformUserId: null,
        slaPolicyId: 'policy-1',
        responseDueAt: new Date(),
        resolutionDueAt: new Date(),
        firstResponseAt: new Date(),
        resolvedAt: new Date(),
        closedAt: new Date(),
        createdByPlatformUserId: 'actor-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      service.updateTicket(
        'ticket-1',
        'actor-1',
        { status: 'IN_PROGRESS' },
        'Reopen request',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records first response idempotently and advances OPEN to IN_PROGRESS', async () => {
    const after = {
      id: 'ticket-1',
      tenantId: 'tenant-1',
      subject: 'Need help',
      description: null,
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      source: 'TENANT',
      requesterEmail: 'owner@example.com',
      assignedPlatformUserId: null,
      slaPolicyId: 'policy-high',
      responseDueAt: new Date(),
      resolutionDueAt: new Date(),
      firstResponseAt: new Date(),
      resolvedAt: null,
      closedAt: null,
      createdByPlatformUserId: 'actor-1',
      responseBreached: false,
      resolutionBreached: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'ticket-1',
          tenantId: 'tenant-1',
          status: 'OPEN',
          firstResponseAt: null,
        },
      ])
      .mockResolvedValueOnce([after]);

    const result = await service.respond(
      'ticket-1',
      'actor-2',
      'We are investigating.',
      'request-1',
    );

    expect(result).toEqual(after);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ticket.respond',
        targetTenantId: 'tenant-1',
        correlationId: 'request-1',
        afterState: expect.objectContaining({ firstResponseRecorded: true }),
      }),
      tx,
    );
  });

  it('replaces the active sla policy instead of mutating historical policy rows', async () => {
    const oldPolicy = {
      id: 'policy-old',
      name: 'Default High',
      priority: 'HIGH',
      clockMode: 'CALENDAR',
      initialResponseMinutes: 60,
      resolutionMinutes: 480,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const newPolicy = {
      ...oldPolicy,
      id: 'policy-new',
      name: 'High Priority 2026',
      initialResponseMinutes: 30,
      resolutionMinutes: 360,
    };
    tx.$queryRaw
      .mockResolvedValueOnce([oldPolicy])
      .mockResolvedValueOnce([newPolicy]);

    const result = await service.replacePolicy(
      'actor-1',
      {
        priority: 'HIGH',
        name: 'High Priority 2026',
        initialResponseMinutes: 30,
        resolutionMinutes: 360,
      },
      'Tighten enterprise SLA',
      'request-2',
    );

    expect(result).toEqual(newPolicy);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'sla',
        action: 'policy.replace',
        beforeState: oldPolicy,
        afterState: newPolicy,
      }),
      tx,
    );
  });
});
