import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const guard = new PlatformAdminGuard(prisma);

  const contextFor = (userId?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { sub: userId } : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows only explicitly active platform administrators', async () => {
    queryRaw.mockResolvedValue([{ userId: 'user-1' }]);

    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects authenticated tenant users without platform administrator assignment', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(guard.canActivate(contextFor('user-2'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects requests without an authenticated user id', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
