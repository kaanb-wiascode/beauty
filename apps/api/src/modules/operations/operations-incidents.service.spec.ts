import { ConflictException } from '@nestjs/common';

import { OperationsIncidentsService } from './operations-incidents.service';

describe('OperationsIncidentsService', () => {
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

  it('creates a resource block and links it to a room outage incident', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'room-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'block-1' }])
      .mockResolvedValueOnce([
        {
          id: 'incident-1',
          type: 'ROOM_UNAVAILABLE',
          severity: 'HIGH',
          status: 'OPEN',
          title: 'Room outage',
          description: null,
          roomId: 'room-1',
          assetId: null,
          resourceBlockId: 'block-1',
          qualityCaseId: null,
          openedAt: new Date(),
          resolvedAt: null,
          resolutionNote: null,
          version: 1,
        },
      ]);

    const service = new OperationsIncidentsService(prisma, tenantContext);
    const result = await service.create({
      type: 'ROOM_UNAVAILABLE',
      severity: 'HIGH',
      title: 'Room outage',
      roomId: '00000000-0000-4000-8000-000000000001',
      outageTo: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(result.resourceBlockId).toBe('block-1');
    expect(executeRawUnsafe).toHaveBeenCalled();
  });

  it('resolves an incident and cancels its active resource block', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'incident-1',
          type: 'DEVICE_FAILURE',
          severity: 'CRITICAL',
          status: 'OPEN',
          title: 'Device failed',
          description: null,
          roomId: null,
          assetId: 'asset-1',
          resourceBlockId: 'block-1',
          qualityCaseId: null,
          openedAt: new Date(),
          resolvedAt: null,
          resolutionNote: null,
          version: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'incident-1',
          type: 'DEVICE_FAILURE',
          severity: 'CRITICAL',
          status: 'RESOLVED',
          title: 'Device failed',
          description: null,
          roomId: null,
          assetId: 'asset-1',
          resourceBlockId: 'block-1',
          qualityCaseId: null,
          openedAt: new Date(),
          resolvedAt: new Date(),
          resolutionNote: 'Fixed',
          version: 3,
        },
      ]);

    const service = new OperationsIncidentsService(prisma, tenantContext);
    const result = await service.resolve('incident-1', {
      expectedVersion: 2,
      resolutionNote: 'Fixed',
    });

    expect(result.status).toBe('RESOLVED');
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE operations_resource_blocks"),
      'block-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'membership-1',
    );
  });

  it('rejects stale incident resolution versions', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'incident-1',
          type: 'NETWORK',
          severity: 'MEDIUM',
          status: 'OPEN',
          title: 'Network',
          description: null,
          roomId: null,
          assetId: null,
          resourceBlockId: null,
          qualityCaseId: null,
          openedAt: new Date(),
          resolvedAt: null,
          resolutionNote: null,
          version: 4,
        },
      ]);

    const service = new OperationsIncidentsService(prisma, tenantContext);
    await expect(
      service.resolve('incident-1', {
        expectedVersion: 3,
        resolutionNote: 'Recovered',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
