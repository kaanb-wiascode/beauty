import { BadRequestException, ConflictException } from '@nestjs/common';

import { ServiceExecutionsService } from './service-executions.service';

describe('ServiceExecutionsService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const appointmentFindFirst = jest.fn();
  const appointmentUpdate = jest.fn();
  const appointmentFindUnique = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      appointment: {
        findFirst: appointmentFindFirst,
        update: appointmentUpdate,
        findUnique: appointmentFindUnique,
      },
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
    appointmentFindFirst.mockReset();
    appointmentUpdate.mockReset();
    appointmentFindUnique.mockReset();
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
    ).rejects.toThrow(
      'Service requires an available room allocation of type LASER_ROOM.',
    );
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

  it('does not complete an appointment before service execution is completed', async () => {
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
          version: 1,
        },
      ]);

    const service = new ServiceExecutionsService(prisma, tenantContext);

    await expect(
      service.completeAppointmentHandoff('execution-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(appointmentUpdate).not.toHaveBeenCalled();
  });

  it('completes the appointment handoff without consuming its reserved package session', async () => {
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
          status: 'COMPLETED',
          startedAt: new Date(),
          completedAt: new Date(),
          note: null,
          completionNote: null,
          version: 2,
        },
      ])
      .mockResolvedValueOnce([]);
    appointmentFindFirst.mockResolvedValue({
      id: 'appointment-1',
      status: 'CONFIRMED',
      session: { id: 'session-1', status: 'RESERVED' },
    });
    appointmentUpdate.mockResolvedValue({
      id: 'appointment-1',
      status: 'COMPLETED',
    });
    appointmentFindUnique.mockResolvedValue({
      id: 'appointment-1',
      status: 'COMPLETED',
      session: { id: 'session-1', status: 'RESERVED' },
    });

    const service = new ServiceExecutionsService(prisma, tenantContext);
    const result = await service.completeAppointmentHandoff('execution-1');

    expect(appointmentUpdate).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'COMPLETED' },
    });
    expect(result.packageSessionRequiresExplicitConsumption).toBe(true);
    expect(result.appointment.session.status).toBe('RESERVED');
  });
});
