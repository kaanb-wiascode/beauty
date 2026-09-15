import { OperationsConsumablesService } from './operations-consumables.service';

describe('OperationsConsumablesService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;

  beforeEach(() => {
    queryRawUnsafe.mockReset();
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
        actualQuantity: 0,
        varianceQuantity: -10,
        posted: false,
      }),
    ]);
  });

  it('matches posted service-consumption movements to the expected recipe', async () => {
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
        },
      ])
      .mockResolvedValueOnce([
        {
          movementId: 'movement-1',
          productId: 'product-1',
          productName: 'Serum',
          sku: 'SRM-1',
          unit: 'ML',
          actualQuantity: '10.000',
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
        actualQuantity: 10,
        varianceQuantity: 0,
        posted: true,
      }),
    );
  });

  it('reports no posting requirement when the service has no consumable recipe', async () => {
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
});
