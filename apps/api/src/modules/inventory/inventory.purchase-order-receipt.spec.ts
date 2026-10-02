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
          subtotalAmount: '200',
          taxAmount: '40',
          totalAmount: '240',
          note: 'Serum alımı',
          branchId: 'branch-1',
          supplierName: 'Tedarikçi A',
        },
      ])
      .mockResolvedValueOnce([
        {
          productId: 'product-1',
          quantity: '2',
          unitCost: '100',
          taxRate: '20',
          taxAmount: '40',
        },
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
      subtotalAmount: 200,
      taxAmount: 40,
      totalAmount: 240,
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
        taxAmount: 40,
        branchId: 'branch-1',
      }),
    );
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status='RECEIVED'"),
      ),
    ).toBe(true);
  });
  it('enforces the purchase order lifecycle before receipt', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'po-2', status: 'PENDING', supplierId: 'supplier-1' }])
      .mockResolvedValueOnce([{ id: 'po-2', status: 'APPROVED' }])
      .mockResolvedValueOnce([{ id: 'po-2', status: 'RECEIVED' }]);

    const execute = jest.fn().mockResolvedValue(1);
    const tx: any = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new InventoryService(
      prisma,
      tenant,
      inventoryScope,
      { createInventoryPurchaseBillWithinTransaction: jest.fn() } as any,
    );

    await expect(service.approvePurchaseOrder('po-2')).resolves.toEqual({
      purchaseOrderId: 'po-2',
      status: 'APPROVED',
      idempotent: false,
    });

    await expect(
      service.orderPurchaseOrder('po-2', new Date('2026-10-02T11:00:00.000Z')),
    ).resolves.toEqual({
      purchaseOrderId: 'po-2',
      status: 'ORDERED',
      idempotent: false,
    });

    await expect(service.cancelPurchaseOrder('po-2')).rejects.toThrow(
      'Teslim alınmış satın alma siparişi iptal edilemez.',
    );

    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status='APPROVED'"),
      ),
    ).toBe(true);
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status='ORDERED'"),
      ),
    ).toBe(true);
  });
  it('returns a received purchase order by reversing stock and supplier payable atomically', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'po-3',
          status: 'RECEIVED',
          warehouseId: 'warehouse-1',
          totalAmount: '200',
          branchId: 'branch-1',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { productId: 'product-1', receivedQuantity: '2', unitCost: '100' },
      ])
      .mockResolvedValueOnce([{ quantity: '5' }]);

    const execute = jest.fn().mockResolvedValue(1);
    const tx: any = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const accountsPayable = {
      cancelInventoryPurchaseBillWithinTransaction: jest.fn().mockResolvedValue({
        id: 'bill-3',
        status: 'CANCELLED',
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
      service.returnPurchaseOrder('po-3', {
        reason: 'Tedarikçiye iade',
        actorId: 'user-1',
      }),
    ).resolves.toEqual({
      purchaseOrderId: 'po-3',
      status: 'RETURNED',
      supplierBillId: 'bill-3',
      idempotent: false,
    });

    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes('quantity=quantity-$3'),
      ),
    ).toBe(true);
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("'RETURN'"),
      ),
    ).toBe(true);
    expect(accountsPayable.cancelInventoryPurchaseBillWithinTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        purchaseOrderId: 'po-3',
        branchId: 'branch-1',
        reason: 'Tedarikçiye iade',
      }),
    );
    expect(
      execute.mock.calls.some((call: any[]) =>
        String(call[0]).includes("SET status='CANCELLED'"),
      ),
    ).toBe(true);
  });


});
