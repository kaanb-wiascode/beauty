import { PrismaService } from '@beauty-erp/database';

import { PlatformIamReadService } from './platform-iam-read.service';

describe('PlatformIamReadService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new PlatformIamReadService(prisma);

  beforeEach(() => queryRaw.mockReset());

  it('returns platform admins, roles, permissions and summary counts', async () => {
    const admins = [
      {
        userId: 'user-1',
        email: 'admin@example.com',
        firstName: 'Platform',
        lastName: 'Admin',
        status: 'ACTIVE',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        updatedAt: new Date('2026-09-15T00:00:00.000Z'),
        roles: [{ slug: 'PLATFORM_ADMIN', name: 'Platform Admin' }],
      },
      {
        userId: 'user-2',
        email: 'auditor@example.com',
        firstName: 'Platform',
        lastName: 'Auditor',
        status: 'SUSPENDED',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        updatedAt: new Date('2026-09-15T00:00:00.000Z'),
        roles: [{ slug: 'PLATFORM_AUDITOR', name: 'Platform Auditor' }],
      },
    ];
    const roles = [{ slug: 'PLATFORM_ADMIN', name: 'Platform Admin', description: null, system: true, userCount: 1, permissions: [] }];
    const permissions = [{ resource: 'platform_iam', action: 'read', description: null, roleCount: 2 }];

    queryRaw.mockResolvedValueOnce(admins).mockResolvedValueOnce(roles).mockResolvedValueOnce(permissions);

    await expect(service.getOverview()).resolves.toEqual({
      summary: { adminCount: 2, activeAdminCount: 1, roleCount: 1, permissionCount: 1 },
      admins,
      roles,
      permissions,
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});
