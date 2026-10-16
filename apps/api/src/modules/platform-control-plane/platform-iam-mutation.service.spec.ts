import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformIamMutationService } from './platform-iam-mutation.service';

describe('PlatformIamMutationService', () => {
  const transaction = jest.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const service = new PlatformIamMutationService(prisma);

  beforeEach(() => {
    transaction.mockReset();
  });

  it('requires an operational reason before opening a transaction', async () => {
    await expect(
      service.provisionAdmin(
        { actorUserId: 'actor-1', reason: 'short' },
        { userId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('prevents a platform admin from suspending their own account', async () => {
    await expect(
      service.setAdminStatus(
        { actorUserId: 'actor-1', reason: 'Operational access review' },
        { userId: 'actor-1', status: 'SUSPENDED' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('prevents a platform admin from removing their own platform role', async () => {
    await expect(
      service.removeRole(
        { actorUserId: 'actor-1', reason: 'Role cleanup requested' },
        { userId: 'actor-1', roleSlug: 'PLATFORM_ADMIN' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('never allows PLATFORM_OWNER to lose platform_iam.manage', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ userId: 'actor-1' }])
        .mockResolvedValueOnce([{ slug: 'PLATFORM_OWNER' }])
        .mockResolvedValueOnce([{ resource: 'platform_iam' }]),
      $executeRaw: jest.fn(),
    };
    transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      service.revokeRolePermission(
        { actorUserId: 'actor-1', reason: 'Permission matrix hardening' },
        {
          roleSlug: 'PLATFORM_OWNER',
          resource: 'platform_iam',
          action: 'manage',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
