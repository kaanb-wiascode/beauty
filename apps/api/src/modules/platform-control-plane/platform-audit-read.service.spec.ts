import { PrismaService } from '@beauty-erp/database';

import { PlatformAuditReadService } from './platform-audit-read.service';

describe('PlatformAuditReadService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new PlatformAuditReadService(prisma);

  beforeEach(() => queryRaw.mockReset());

  it('returns paginated audit events without leaking window count', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'event-1',
        actorUserId: 'user-1',
        actorEmail: 'admin@example.com',
        actorFirstName: 'Platform',
        actorLastName: 'Admin',
        resource: 'platform_iam',
        action: 'read',
        targetTenantId: null,
        targetEntityType: null,
        targetEntityId: null,
        reason: null,
        beforeState: null,
        afterState: null,
        metadata: {},
        correlationId: 'corr-1',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        totalCount: 42,
      },
    ]);

    const result = await service.list({ limit: 500, offset: -10 });

    expect(result.pagination).toEqual({ total: 42, limit: 100, offset: 0 });
    expect(result.items[0]).not.toHaveProperty('totalCount');
  });

  it('returns an empty page with a stable pagination shape', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(service.list()).resolves.toEqual({
      items: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    });
  });
});
