import { InventoryService } from './inventory.service';

describe('InventoryService purchase order receipt', () => {
  const tenant = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
    getBranchId: jest.fn(() => 'branch-1'),
  } as any;

  const inventoryScope = {
    getWarehouseScope: jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: ['branch-1'],
    }),
  } as any;

  it('receives an approved purchase order into stock and creates supplier payable atomically', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'po-1',
          status: 'APPROVED',
          supplierId: 'supplier-1',
          warehouseId: 'warehouse-1',
          totalAmount: '200',
          note: 'Serum alımı',
          branchId: 'branch-1',
          supplierName: 'Tedarikçi A',
        },
      ])
      .mockResolvedValueOnce([
        { productId: 'product-1', quantity: '2', unitCost: '100' },
      ])
      .mockResolvedValueOnce([{ quantity: '3', costPerUnit: '80' }]);

    const execute = jest.fn().mockResolvedValue(1);
    const tx: any = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const accountsPayable = {
      createInventoryPurchaseBillWithinTransaction: jest.fn().mockResolvedValue({
        id: 'bill-1',
        idempotent: false,
      }),
    };

    const service = new InventoryService(
      prisma,
      tenant,
      inventoryScope,
      accountsPayable as any,
    );

    await expect(
      service.receivePurchaseOrder('po-1', {
        invoiceNumber: 'INV-1',
        dueAt: new Date('2026-10-31T00:00:00.000Z'),
        receivedAt: new Date('2026-10-02T10:00:00.000Z'),
        actorId: 'user-1',
      }),
    ).resolves.toEqual({
      purchaseOrderId: 'po-1',
      status: 'RECEIVED',
      totalAmount: 200,
      supplierBillId: 'bill-1',
      idempotent: false,
    });

    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes('INSERT INTO inventory_stock'),
      ),
    ).toBe(true);
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("'PURCHASE'"),
      ),
    ).toBe(true);
    expect(accountsPayable.createInventoryPurchaseBillWithinTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        purchaseOrderId: 'po-1',
        supplierId: 'supplier-1',
        amount: 200,
        branchId: 'branch-1',
      }),
    );
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status='RECEIVED'"),
      ),
    ).toBe(true);
  });
});
