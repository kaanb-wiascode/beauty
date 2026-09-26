import { ProcurementRequestsService } from './procurement-requests.service';

describe('ProcurementRequestsService', () => {
  function createService(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    return { service: new ProcurementRequestsService(prisma, tenant), execute };
  }

  it('lists purchase requests only from the active warehouse branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service } = createService(query);

    await service.listPurchaseRequests('PENDING');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('JOIN inventory_warehouses w');
    expect(sql).toContain('w.branch_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['company-a', 'branch-a', 'PENDING']);
  });

  it('scopes purchase-request conversion through the warehouse branch', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 'request-1',
        status: 'APPROVED',
        warehouseId: 'warehouse-1',
        productId: 'product-1',
        requestedQuantity: 2,
        convertedPurchaseOrderId: null,
      }])
      .mockResolvedValueOnce([{ id: 'supplier-1' }])
      .mockResolvedValueOnce([{ id: 'po-1', status: 'APPROVED', totalAmount: 20 }]);
    const { service } = createService(query);

    const result = await service.convertPurchaseRequest('request-1', {
      supplierId: 'supplier-1',
      unitCost: 10,
    });

    const scopeSql = String(query.mock.calls[0][0]);
    expect(scopeSql).toContain('JOIN inventory_warehouses w');
    expect(scopeSql).toContain('w.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['request-1', 'company-a', 'branch-a']);
    expect(result).toMatchObject({
      purchaseRequestId: 'request-1',
      purchaseOrderId: 'po-1',
      purchaseRequestStatus: 'ORDERED',
    });
  });
});
