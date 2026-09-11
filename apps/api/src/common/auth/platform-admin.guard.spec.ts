import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
  const guard = new PlatformAdminGuard(prisma);

  const contextFor = (userId: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: userId } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows only explicitly active platform administrators', async () => {
    queryRawUnsafe.mockResolvedValue([{ userId: 'user-1' }]);

    await expect(guard.canActivate(contextFor('user-1'))).resolves.toBe(true);

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='ACTIVE'"),
      'user-1',
    );
  });

  it('rejects authenticated tenant users without platform administrator assignment', async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await expect(guard.canActivate(contextFor('user-2'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
