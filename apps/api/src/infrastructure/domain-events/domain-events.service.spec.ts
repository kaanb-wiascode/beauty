import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { RedisService } from '../redis/redis.service';
import { DomainEventsService } from './domain-events.service';

describe('DomainEventsService', () => {
  const context = {
    tenantId: 'tenant-a',
    companyId: 'company-a',
    branchId: 'branch-a',
    membershipId: 'membership-a',
  };

  function build() {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn(),
    } as unknown as PrismaService;

    const redis = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    } as unknown as RedisService;

    const tenantContext = {
      getContext: jest.fn().mockReturnValue(context),
    } as unknown as TenantContext;

    return {
      service: new DomainEventsService(prisma, redis, tenantContext),
      prisma,
      redis,
    };
  }

  it('records an outbox event inside the supplied transaction without publishing early', async () => {
    const { service, redis } = build();
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    } as unknown as Prisma.TransactionClient;

    const eventId = await service.record(tx, {
      eventName: 'visit.checked_in',
      aggregateType: 'visit',
      aggregateId: 'visit-a',
      payload: { status: 'CHECKED_IN' },
    });

    expect(eventId).toEqual(expect.any(String));
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('persists and publishes a direct event and marks it as published', async () => {
    const { service, prisma, redis } = build();

    const event = await service.publish({
      eventName: 'sale.confirmed',
      aggregateType: 'sale',
      aggregateId: 'sale-a',
      payload: { total: 1000 },
    });

    expect(event.eventName).toBe('sale.confirmed');
    expect(event.tenantId).toBe(context.tenantId);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(
      'beauty:domain-events',
      expect.stringContaining('"eventName":"sale.confirmed"'),
    );
  });

  it('does not fail a committed business operation when immediate dispatch lookup fails', async () => {
    const { service, prisma } = build();
    jest
      .mocked(prisma.$queryRawUnsafe)
      .mockRejectedValueOnce(new Error('temporary database interruption'));

    await expect(service.dispatchStored('event-a')).resolves.toBeUndefined();
  });
});
