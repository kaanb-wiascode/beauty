import { BadRequestException, ConflictException } from '@nestjs/common';

import { ServiceExecutionsService } from './service-executions.service';

describe('ServiceExecutionsService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
    }),
  );
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: transaction,
  } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    transaction.mockClear();
  });

  it('requires the visit to be IN_SERVICE before execution starts', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          visitId: 'visit-1',
          visitStatus: 'WAITING',
          appointmentId: 'appointment-1',
          appointmentStatus: 'CONFIRMED',
          serviceId: 'service-1',
          staffId: 'staff-1',
        },
      ]);

    const service = new ServiceExecutionsService(prisma, tenantContext);

    await expect(
      service.start('visit-1', {
        appointmentId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a room allocation that does not match the configured room type', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          visitId: 'visit-1',
          visitStatus: 'IN_SERVICE',
          appointmentId: 'appointment-1',
          appointmentStatus: 'CONFIRMED',
          serviceId: 'service-1',
          staffId: 'staff-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          roomType: 'LASER_ROOM',
          requiredAssetType: null,
          requiredAssetId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          roomId: 'room-1',
          roomType: 'TREATMENT_ROOM',
          roomStatus: 'RESERVED',
          assetId: null,
          assetType: null,
          assetStatus: null,
          assetMaintenanceBlocked: false,
        },
      ]);

    const service = new ServiceExecutionsService(prisma, tenantContext);

    await expect(
      service.start('visit-1', {
        appointmentId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('Service requires an available room allocation of type LASER_ROOM.');
  });

  it('rejects equipment that entered maintenance after reservation', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          visitId: 'visit-1',
          visitStatus: 'IN_SERVICE',
          appointmentId: 'appointment-1',
          appointmentStatus: 'CONFIRMED',
          serviceId: 'service-1',
          staffId: 'staff-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          roomType: null,
          requiredAssetType: 'LASER',
          requiredAssetId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          roomId: null,
          roomType: null,
          roomStatus: null,
          assetId: 'asset-1',
          assetType: 'LASER',
          assetStatus: 'ACTIVE',
          assetMaintenanceBlocked: true,
        },
      ]);

    const service = new ServiceExecutionsService(prisma, tenantContext);

    await expect(
      service.start('visit-1', {
        appointmentId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('Service requires an active LASER equipment allocation.');
  });

  it('rejects stale completion versions', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          visitId: 'visit-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          staffId: 'staff-1',
          roomId: null,
          assetId: null,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          completedAt: null,
          note: null,
          completionNote: null,
          version: 2,
        },
      ]);

    const service = new ServiceExecutionsService(prisma, tenantContext);

    await expect(
      service.complete('execution-1', { expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
