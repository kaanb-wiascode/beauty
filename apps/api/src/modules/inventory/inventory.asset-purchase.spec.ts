import { InventoryService } from './inventory.service';

describe('InventoryService asset purchase integration', () => {
  it('creates a supplier payable for a priced asset purchase', async () => {
    const tenant = {
      getTenantId: jest.fn(() => 'tenant-1'),
      getCompanyId: jest.fn(() => 'company-1'),
      getBranchId: jest.fn(() => null),
    } as any;

    const inventoryScope = {
      getWarehouseScope: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchIds: null,
      }),
    } as any;

    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM inventory_suppliers')) {
        return [{ id: 'supplier-1' }];
      }
      if (sql.includes('INSERT INTO inventory_assets')) {
        return [
          {
            id: 'asset-1',
            assetCode: 'DM-001',
            name: 'Lazer Cihazı',
            assetType: 'EQUIPMENT',
            status: 'ACTIVE',
            condition: 'GOOD',
          },
        ];
      }
      return [];
    });

    const tx: any = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn(),
    };
    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };

    const accountsPayable = {
      createAssetPurchaseBillWithinTransaction: jest.fn().mockResolvedValue({
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
      service.createAsset({
        assetCode: 'DM-001',
        name: 'Lazer Cihazı',
        assetType: 'EQUIPMENT',
        supplierId: 'supplier-1',
        invoiceNumber: 'FAT-2026-001',
        purchasePrice: 250000,
        currency: 'TRY',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'asset-1',
        supplierBillId: 'bill-1',
      }),
    );

    expect(
      accountsPayable.createAssetPurchaseBillWithinTransaction,
    ).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: null,
        supplierId: 'supplier-1',
        assetId: 'asset-1',
        invoiceNumber: 'FAT-2026-001',
        amount: 250000,
      }),
    );
  });
});
