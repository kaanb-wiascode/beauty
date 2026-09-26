import { BadRequestException } from '@nestjs/common';

import { PlatformEntitlementsService } from './platform-entitlements.service';

describe('PlatformEntitlementsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const service = new PlatformEntitlementsService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the effective entitlement rows resolved by the database query', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'tenant-1' }])
      .mockResolvedValueOnce([
        {
          key: 'finance.enabled',
          name: 'Finance',
          description: null,
          valueType: 'BOOLEAN',
          defaultValue: false,
          planValue: true,
          overrideId: 'override-1',
          overrideValue: false,
          overrideStartsAt: new Date('2026-09-15T00:00:00Z'),
          overrideEndsAt: new Date('2026-09-20T00:00:00Z'),
          effectiveValue: false,
          source: 'OVERRIDE',
          status: 'ACTIVE',
        },
      ]);

    const result = await service.getTenantEntitlements('tenant-1');

    expect(result.tenantId).toBe('tenant-1');
    expect(result.items[0]).toMatchObject({
      key: 'finance.enabled',
      effectiveValue: false,
      source: 'OVERRIDE',
    });
  });

  it('rejects short override reasons before inserting', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'tenant-1' }])
      .mockResolvedValueOnce([
        {
          key: 'finance.enabled',
          name: 'Finance',
          description: null,
          valueType: 'BOOLEAN',
          defaultValue: false,
          status: 'ACTIVE',
        },
      ]);

    await expect(
      service.createOverride('actor-1', 'tenant-1', {
        entitlementKey: 'finance.enabled',
        value: true,
        reason: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
