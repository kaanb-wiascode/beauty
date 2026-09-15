import { ConflictException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsAllocationService } from './operations-allocation.service';

describe('OperationsAllocationService conflict engine', () => {
  const queryRawUnsafe = jest.fn();
  const tx = { $queryRawUnsafe: queryRawUnsafe };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
    getMembershipId: jest.fn().mockReturnValue('membership-1'),
  } as unknown as TenantContext;
  const service = new OperationsAllocationService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a room reservation that overlaps an existing allocation', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'appointment-1',
          serviceId: 'service-1',
          startAt: new Date('2026-09-15T10:00:00.000Z'),
          endAt: new Date('2026-09-15T11:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ])
      .mockResolvedValueOnce([
        {
          roomType: 'LASER_ROOM',
          requiredAssetType: null,
          requiredAssetId: null,
          prepDurationMinutes: 15,
          cleanupDurationMinutes: 15,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'room-1', name: 'Lazer Odası 1', roomType: 'LASER_ROOM', status: 'AVAILABLE' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'allocation-foreign',
          appointmentId: 'appointment-2',
          blockedFrom: new Date('2026-09-15T09:45:00.000Z'),
          blockedTo: new Date('2026-09-15T11:15:00.000Z'),
        },
      ]);

    await expect(
      service.allocate('appointment-1', {
        roomId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a room reservation that overlaps an active outage block', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'appointment-1',
          serviceId: 'service-1',
          startAt: new Date('2026-09-15T10:00:00.000Z'),
          endAt: new Date('2026-09-15T11:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'room-1', name: 'Oda 1', roomType: 'TREATMENT_ROOM', status: 'AVAILABLE' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'block-1',
          reason: 'Operational incident: HVAC failure',
          blockedFrom: new Date('2026-09-15T09:30:00.000Z'),
          blockedTo: new Date('2026-09-15T12:00:00.000Z'),
        },
      ]);

    await expect(
      service.allocate('appointment-1', {
        roomId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RESOURCE_UNAVAILABLE_BLOCK',
        resourceBlockId: 'block-1',
      }),
    });

    expect(queryRawUnsafe).toHaveBeenCalledTimes(7);
  });

  it('returns an existing reservation for the same appointment and resource', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'appointment-1',
          serviceId: 'service-1',
          startAt: new Date('2026-09-15T10:00:00.000Z'),
          endAt: new Date('2026-09-15T11:00:00.000Z'),
          status: 'CONFIRMED',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'room-1', name: 'Oda 1', roomType: 'TREATMENT_ROOM', status: 'AVAILABLE' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'allocation-1',
          status: 'RESERVED',
          version: 1,
          blockedFrom: new Date('2026-09-15T10:00:00.000Z'),
          blockedTo: new Date('2026-09-15T11:00:00.000Z'),
        },
      ]);

    const result = await service.allocate('appointment-1', {
      roomId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.allocations).toEqual([
      expect.objectContaining({ id: 'allocation-1' }),
    ]);
  });
});
