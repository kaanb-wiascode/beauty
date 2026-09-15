import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformPrivilegedExecutionService } from './platform-privileged-execution.service';

const context = {
  requestId: 'http-req-1',
  sourceIp: '127.0.0.1',
  userAgent: 'test-agent',
};

describe('PlatformPrivilegedExecutionService', () => {
  const transaction = jest.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const service = new PlatformPrivilegedExecutionService(prisma);

  beforeEach(() => transaction.mockReset());

  function tx() {
    return { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
  }

  it('rejects execution unless the request is approved', async () => {
    const client = tx();
    transaction.mockImplementation(async (cb: (arg: typeof client) => unknown) => cb(client));
    client.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-2' }])
      .mockResolvedValueOnce([{
        id: 'approval-1', requesterUserId: 'owner-1', resource: 'platform_iam',
        action: 'role.assign', riskLevel: 'HIGH', status: 'PENDING',
        targetEntityType: 'platform_admin_user', targetEntityId: 'user-2',
        targetTenantId: null, reason: 'Grant operational role',
        payload: { userId: 'user-2', roleSlug: 'PLATFORM_ADMIN' },
        expiresAt: new Date(Date.now() + 60_000),
      }]);

    await expect(service.execute({ actorUserId: 'owner-2', requestId: 'approval-1', context }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it('marks an expired approved request without executing its payload', async () => {
    const client = tx();
    transaction.mockImplementation(async (cb: (arg: typeof client) => unknown) => cb(client));
    client.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-2' }])
      .mockResolvedValueOnce([{
        id: 'approval-1', requesterUserId: 'owner-1', resource: 'platform_iam',
        action: 'role.assign', riskLevel: 'HIGH', status: 'APPROVED',
        targetEntityType: 'platform_admin_user', targetEntityId: 'user-2',
        targetTenantId: null, reason: 'Grant operational role',
        payload: { userId: 'user-2', roleSlug: 'PLATFORM_ADMIN' },
        expiresAt: new Date(Date.now() - 60_000),
      }]);
    client.$executeRaw.mockResolvedValueOnce(1);

    await expect(service.execute({ actorUserId: 'owner-2', requestId: 'approval-1', context }))
      .resolves.toEqual({ id: 'approval-1', status: 'EXPIRED' });
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('blocks an executor from suspending their own account from stored payload', async () => {
    const client = tx();
    transaction.mockImplementation(async (cb: (arg: typeof client) => unknown) => cb(client));
    client.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-2' }])
      .mockResolvedValueOnce([{
        id: 'approval-1', requesterUserId: 'owner-1', resource: 'platform_iam',
        action: 'admin.suspend', riskLevel: 'HIGH', status: 'APPROVED',
        targetEntityType: 'platform_admin_user', targetEntityId: 'owner-2',
        targetTenantId: null, reason: 'Suspend compromised account',
        payload: { userId: 'owner-2' },
        expiresAt: new Date(Date.now() + 60_000),
      }]);

    await expect(service.execute({ actorUserId: 'owner-2', requestId: 'approval-1', context }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('executes an approved role assignment once and writes the linked audit event', async () => {
    const client = tx();
    transaction.mockImplementation(async (cb: (arg: typeof client) => unknown) => cb(client));
    client.$queryRaw
      .mockResolvedValueOnce([{ userId: 'owner-2' }])
      .mockResolvedValueOnce([{
        id: 'approval-1', requesterUserId: 'owner-1', resource: 'platform_iam',
        action: 'role.assign', riskLevel: 'HIGH', status: 'APPROVED',
        targetEntityType: 'platform_admin_user', targetEntityId: 'user-2',
        targetTenantId: null, reason: 'Grant operational role',
        payload: { userId: 'user-2', roleSlug: 'PLATFORM_ADMIN' },
        expiresAt: new Date(Date.now() + 60_000),
      }])
      .mockResolvedValueOnce([{ userId: 'user-2', status: 'ACTIVE', roles: [] }])
      .mockResolvedValueOnce([{ slug: 'PLATFORM_ADMIN' }])
      .mockResolvedValueOnce([{ userId: 'user-2', status: 'ACTIVE', roles: ['PLATFORM_ADMIN'] }])
      .mockResolvedValueOnce([{ id: 'audit-1' }]);
    client.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await expect(service.execute({ actorUserId: 'owner-2', requestId: 'approval-1', context }))
      .resolves.toEqual({
        id: 'approval-1',
        status: 'EXECUTED',
        result: { userId: 'user-2', status: 'ACTIVE', roles: ['PLATFORM_ADMIN'] },
      });
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
    expect(client.$queryRaw).toHaveBeenCalledTimes(6);
  });
});
