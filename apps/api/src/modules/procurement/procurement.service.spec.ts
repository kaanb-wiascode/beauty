import { ProcurementService } from './procurement.service';

describe('ProcurementService branch scope', () => {
  function createService(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      chartOfAccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: { create: jest.fn() },
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
    return { service: new ProcurementService(prisma, tenant), query, execute };
  }

  it('returns purchase-order detail only through the active warehouse branch', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 'po-1',
        status: 'ORDERED',
        totalAmount: 20,
        supplierId: 'supplier-1',
        supplierName: 'Supplier',
        warehouseId: 'warehouse-1',
        warehouseName: 'Branch Stock',
        branchId: 'branch-a',
      }])
      .mockResolvedValueOnce([{
        id: 'item-1',
        productId: 'product-1',
        productName: 'Product',
        quantity: 2,
        receivedQuantity: 1,
        remainingQuantity: 1,
        unitCost: 10,
        lineTotal: 20,
      }]);
    const { service } = createService(query);

    const result = await service.getPurchaseOrderDetail('po-1');

    expect(result.order).toMatchObject({ id: 'po-1', branchId: 'branch-a' });
    expect(result.items[0]).toMatchObject({ id: 'item-1', remainingQuantity: 1 });
    const scopeSql = String(query.mock.calls[0][0]);
    expect(scopeSql).toContain('JOIN inventory_warehouses w');
    expect(scopeSql).toContain('w.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['po-1', 'company-a', 'branch-a']);
  });

  it('orders a purchase order through the active warehouse branch only', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const { service } = createService(jest.fn(), execute);

    await service.orderPurchaseOrder('po-1');

    const sql = String(execute.mock.calls[0][0]);
    expect(sql).toContain('FROM inventory_warehouses w');
    expect(sql).toContain('w.branch_id=$3::text');
    expect(execute.mock.calls[0].slice(1)).toEqual(['po-1', 'company-a', 'branch-a']);
  });

  it('scopes goods-receipt listing by active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service } = createService(query);

    await service.listGoodsReceipts('po-1');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('gr.branch_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['company-a', 'branch-a', 'po-1']);
  });
});
