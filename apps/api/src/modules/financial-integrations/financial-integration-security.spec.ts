import { ForbiddenException, HttpException } from '@nestjs/common';
import { FinancialIntegrationPermissionGuard } from './financial-integration-permission.guard';
import { FinancialIntegrationRateLimitGuard } from './financial-integration-rate-limit.guard';

function contextWithUser() {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: { sub: 'user-a', tenantId: 'tenant-a', roleId: 'role-a' },
      }),
    }),
  } as never;
}

describe('Financial integration security', () => {
  it('allows a role with the required permission', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('manage') } as never;
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ allowed: true }]) } as never;
    const guard = new FinancialIntegrationPermissionGuard(reflector, prisma);

    await expect(guard.canActivate(contextWithUser())).resolves.toBe(true);
    expect((prisma as unknown as { $queryRawUnsafe: jest.Mock }).$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'role-a', 'tenant-a', 'manage',
    ]);
  });

  it('denies a role without the required permission', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('read') } as never;
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ allowed: false }]) } as never;
    const guard = new FinancialIntegrationPermissionGuard(reflector, prisma);

    await expect(guard.canActivate(contextWithUser())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces the distributed Redis mutation limit', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ bucket: 'integration-sync', limit: 2, windowSeconds: 60 }),
    } as never;
    const client = {
      incr: jest.fn().mockResolvedValue(3),
      expire: jest.fn().mockResolvedValue(true),
    };
    const redis = { getClient: jest.fn().mockReturnValue(client) } as never;
    const guard = new FinancialIntegrationRateLimitGuard(reflector, redis);

    try {
      await guard.canActivate(contextWithUser());
      throw new Error('Expected rate limit error');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('sets the Redis expiry on the first request in a bucket', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ bucket: 'integration-sync', limit: 10, windowSeconds: 60 }),
    } as never;
    const client = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
    };
    const redis = { getClient: jest.fn().mockReturnValue(client) } as never;
    const guard = new FinancialIntegrationRateLimitGuard(reflector, redis);

    await expect(guard.canActivate(contextWithUser())).resolves.toBe(true);
    expect(client.expire).toHaveBeenCalledWith('rate:finance:tenant-a:user-a:integration-sync', 60);
  });
});
