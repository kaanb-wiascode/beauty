import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PlatformSupportSessionService } from './platform-support-session.service';

describe('PlatformSupportSessionService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const privileged = { create: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new PlatformSupportSessionService(
    prisma as never,
    privileged as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(0);
    tx.$executeRaw.mockResolvedValue(1);
    audit.record.mockResolvedValue(undefined);
  });

  it('requires a live support ticket for controlled write requests', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'tenant-1' }]);

    await expect(
      service.request(
        'platform-admin-1',
        {
          tenantId: 'tenant-1',
          accessMode: 'CONTROLLED_WRITE',
          scopes: ['tenant.read', 'support.write'],
          durationMinutes: 30,
          reason: 'Investigate customer configuration issue',
        },
        { requestId: 'request-1', sourceIp: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(privileged.create).not.toHaveBeenCalled();
  });

  it('opens an independently approved read-only session and consumes approval once', async () => {
    const session = {
      id: 'session-1',
      approvalRequestId: 'approval-1',
      tenantId: 'tenant-1',
      supportTicketId: null,
      requesterPlatformUserId: 'platform-admin-1',
      approverPlatformUserId: 'platform-owner-1',
      openedByPlatformUserId: 'platform-owner-2',
      accessMode: 'READ_ONLY',
      scopes: ['tenant.read', 'support.read'],
      reason: 'Investigate customer configuration issue',
      status: 'ACTIVE',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      revokedAt: null,
      revokedByPlatformUserId: null,
      revokeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tx.$queryRaw
      .mockResolvedValueOnce([{ userId: 'platform-owner-2' }])
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          requesterUserId: 'platform-admin-1',
          approverUserId: 'platform-owner-1',
          resource: 'support_session',
          action: 'session.open',
          riskLevel: 'HIGH',
          status: 'APPROVED',
          targetEntityType: 'tenant',
          targetEntityId: 'tenant-1',
          targetTenantId: 'tenant-1',
          reason: 'Investigate customer configuration issue',
          payload: {
            tenantId: 'tenant-1',
            supportTicketId: null,
            accessMode: 'READ_ONLY',
            scopes: ['tenant.read', 'support.read'],
            durationMinutes: 30,
          },
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ])
      .mockResolvedValueOnce([session]);

    const result = await service.openApproved(
      'approval-1',
      'platform-owner-2',
      { requestId: 'request-2', sourceIp: '127.0.0.1', userAgent: 'test' },
    );

    expect(result).toEqual(session);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.open',
        approvalRequestId: 'approval-1',
        targetTenantId: 'tenant-1',
        riskLevel: 'HIGH',
      }),
      tx,
    );
  });

  it('binds a session to the requester and rejects writes from read-only sessions', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'session-1',
        approvalRequestId: 'approval-1',
        tenantId: 'tenant-1',
        supportTicketId: null,
        requesterPlatformUserId: 'platform-admin-1',
        approverPlatformUserId: 'platform-owner-1',
        openedByPlatformUserId: 'platform-owner-2',
        accessMode: 'READ_ONLY',
        scopes: ['tenant.read', 'support.read'],
        reason: 'Investigate customer configuration issue',
        status: 'ACTIVE',
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        revokedAt: null,
        revokedByPlatformUserId: null,
        revokeReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      service.assertActiveSession({
        sessionId: 'session-1',
        actorUserId: 'platform-admin-1',
        tenantId: 'tenant-1',
        requiredScope: 'tenant.read',
        write: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
