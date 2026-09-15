import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';

const operationContext = {
  requestId: 'req-1',
  sourceIp: '127.0.0.1',
  userAgent: 'test-agent',
};

describe('PlatformPrivilegedOperationsService', () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new PlatformPrivilegedOperationsService(prisma);

  beforeEach(() => {
    queryRaw.mockReset();
    executeRaw.mockReset();
    transaction.mockReset();
  });

  it('creates a classified privileged operation request and audit event', async () => {
    const created = {
      id: 'approval-1',
      createdAt: new Date('2026-09-15T12:00:00.000Z'),
      expiresAt: new Date('2026-09-16T12:00:00.000Z'),
    };
    queryRaw.mockResolvedValueOnce([created]).mockResolvedValueOnce([{ id: 'audit-1' }]);

    await expect(
      service.create({
        actorUserId: 'owner-1',
        resource: 'platform_iam',
        action: 'permission.revoke',
        targetEntityType: 'platform_role',
        targetEntityId: 'PLATFORM_ADMIN',
        reason: 'Remove obsolete elevated permission',
        payload: { resource: 'customers', action: 'read' },
        context: operationContext,
      }),
    ).resolves.toEqual({ ...created, riskLevel: 'CRITICAL' });

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('prevents a requester from deciding their own request', async () => {
    const tx = { $queryRaw: jest.fn(), $executeRaw: executeRaw };
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-1' }])
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          requesterUserId: 'owner-1',
          resource: 'platform_iam',
          action: 'permission.revoke',
          riskLevel: 'CRITICAL',
          status: 'PENDING',
          targetTenantId: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

    await expect(
      service.decide({
        actorUserId: 'owner-1',
        requestId: 'approval-1',
        decision: 'APPROVED',
        reason: 'Reviewed and approved',
        context: operationContext,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an active PLATFORM_OWNER to decide a request', async () => {
    const tx = { $queryRaw: jest.fn(), $executeRaw: executeRaw };
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.decide({
        actorUserId: 'admin-1',
        requestId: 'approval-1',
        decision: 'REJECTED',
        reason: 'Insufficient justification',
        context: operationContext,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects expired requests and marks them expired in the transaction', async () => {
    const tx = { $queryRaw: jest.fn(), $executeRaw: executeRaw };
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-2' }])
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          requesterUserId: 'owner-1',
          resource: 'platform_iam',
          action: 'role.remove',
          riskLevel: 'HIGH',
          status: 'PENDING',
          targetTenantId: null,
          expiresAt: new Date(Date.now() - 60_000),
        },
      ]);

    await expect(
      service.decide({
        actorUserId: 'owner-2',
        requestId: 'approval-1',
        decision: 'APPROVED',
        reason: 'Approval arrived too late',
        context: operationContext,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps approval queue pagination and hides totalCount from items', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'approval-1',
        requesterUserId: 'owner-1',
        requesterEmail: 'owner@example.com',
        approverUserId: null,
        approverEmail: null,
        resource: 'platform_iam',
        action: 'role.assign',
        riskLevel: 'HIGH',
        status: 'PENDING',
        targetEntityType: 'platform_admin_user',
        targetEntityId: 'user-2',
        targetTenantId: null,
        reason: 'Operational access requirement',
        decisionReason: null,
        createdAt: new Date(),
        decidedAt: null,
        executedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        totalCount: 7,
      },
    ]);

    const result = await service.list({ status: 'pending', limit: 1000, offset: -2 });
    expect(result.pagination).toEqual({ total: 7, limit: 100, offset: 0 });
    expect(result.items[0]).not.toHaveProperty('totalCount');
  });
});
