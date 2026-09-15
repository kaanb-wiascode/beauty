import { ConflictException } from '@nestjs/common';

import { OperationsConsumablesService } from './operations-consumables.service';

describe('OperationsConsumablesService', () => {
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

  it('returns pending expected consumables before inventory posting exists', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          status: 'COMPLETED',
        },
      ])
      .mockResolvedValueOnce([
        {
          productId: 'product-1',
          productName: 'Serum',
          sku: 'SRM-1',
          unit: 'ML',
          expectedQuantity: '10.000',
          recordedActualQuantity: null,
          version: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const service = new OperationsConsumablesService(prisma, tenantContext);
    const result = await service.executionSummary('execution-1');

    expect(result.postingStatus).toBe('PENDING');
    expect(result.lines).toEqual([
      expect.objectContaining({
        productId: 'product-1',
        expectedQuantity: 10,
        recordedActualQuantity: null,
        plannedActualQuantity: 10,
        postedQuantity: 0,
        varianceQuantity: 0,
        posted: false,
        version: 1,
      }),
    ]);
  });

  it('shows recorded actual variance before inventory posting', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          status: 'COMPLETED',
        },
      ])
      .mockResolvedValueOnce([
        {
          productId: 'product-1',
          productName: 'Serum',
          sku: 'SRM-1',
          unit: 'ML',
          expectedQuantity: '15.000',
          recordedActualQuantity: '22.000',
          version: 2,
        },
      ])
      .mockResolvedValueOnce([]);

    const service = new OperationsConsumablesService(prisma, tenantContext);
    const result = await service.executionSummary('execution-1');

    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        expectedQuantity: 15,
        recordedActualQuantity: 22,
        plannedActualQuantity: 22,
        postedQuantity: 0,
        varianceQuantity: 7,
      }),
    );
  });

  it('matches posted execution movements to the consumable snapshot', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          status: 'COMPLETED',
        },
      ])
      .mockResolvedValueOnce([
        {
          productId: 'product-1',
          productName: 'Serum',
          sku: 'SRM-1',
          unit: 'ML',
          expectedQuantity: '10.000',
          recordedActualQuantity: '12.000',
          version: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          movementId: 'movement-1',
          productId: 'product-1',
          productName: 'Serum',
          sku: 'SRM-1',
          unit: 'ML',
          actualQuantity: '12.000',
          warehouseId: 'warehouse-1',
          consumedAt: new Date('2026-09-15T16:00:00.000Z'),
        },
      ]);

    const service = new OperationsConsumablesService(prisma, tenantContext);
    const result = await service.executionSummary('execution-1');

    expect(result.postingStatus).toBe('POSTED');
    expect(result.movementCount).toBe(1);
    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        expectedQuantity: 10,
        plannedActualQuantity: 12,
        postedQuantity: 12,
        varianceQuantity: 2,
        posted: true,
      }),
    );
  });

  it('reports no posting requirement when the execution snapshot has no consumables', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          status: 'COMPLETED',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const service = new OperationsConsumablesService(prisma, tenantContext);
    const result = await service.executionSummary('execution-1');

    expect(result.postingStatus).toBe('NOT_REQUIRED');
    expect(result.lines).toEqual([]);
  });

  it('rejects actual-consumable edits after inventory posting exists', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'execution-1',
          appointmentId: 'appointment-1',
          serviceId: 'service-1',
          status: 'COMPLETED',
        },
      ])
      .mockResolvedValueOnce([{ id: 'movement-1' }]);

    const service = new OperationsConsumablesService(prisma, tenantContext);

    await expect(
      service.recordActual('execution-1', 'product-1', {
        actualQuantity: 12,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
