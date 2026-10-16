import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';

import { PlatformPermissionsGuard } from './platform-permissions.guard';

const contextFor = (userId?: string): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId ? { sub: userId } : undefined,
      }),
    }),
  }) as unknown as ExecutionContext;

describe('PlatformPermissionsGuard', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new PlatformPermissionsGuard(reflector, prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows handlers that do not declare a platform permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a protected handler when authentication context is missing', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      resource: 'customers',
      action: 'read',
    });

    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('allows an active platform operator with the required permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      resource: 'customers',
      action: 'read',
    });
    queryRaw.mockResolvedValue([{ allowed: true }]);

    await expect(guard.canActivate(contextFor('platform-user-1'))).resolves.toBe(
      true,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects tenant users and platform operators without the required permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      resource: 'platform_iam',
      action: 'manage',
    });
    queryRaw.mockResolvedValue([{ allowed: false }]);

    await expect(
      guard.canActivate(contextFor('tenant-or-limited-user')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
