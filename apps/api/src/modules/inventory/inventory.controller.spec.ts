import { BadRequestException } from '@nestjs/common';
import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { InventoryController } from './inventory.controller';

describe('InventoryController permissions', () => {
  const expectedPermissions = {
    overview: ['inventory', 'read'],
    products: ['inventory', 'read'],
    createProduct: ['inventory', 'create'],
    categories: ['inventory', 'read'],
    createCategory: ['inventory', 'create'],
    movement: ['inventory', 'create'],
    movements: ['inventory', 'read'],
    serviceMaterials: ['inventory', 'read'],
    setServiceMaterials: ['inventory', 'update'],
    purchaseRequests: ['inventory', 'read'],
    suppliers: ['inventory', 'read'],
    createSupplier: ['inventory', 'create'],
    purchaseOrders: ['inventory', 'read'],
    createPurchaseOrder: ['inventory', 'create'],
    assets: ['inventory', 'read'],
    createAsset: ['inventory', 'create'],
    assetMaintenance: ['inventory', 'read'],
    createAssetMaintenance: ['inventory', 'create'],
    notifications: ['inventory', 'read'],
    transfers: ['inventory', 'read'],
    createTransfer: ['inventory', 'create'],
  } as const;

  it('requires an explicit inventory permission on every route', () => {
    for (const [method, permission] of Object.entries(expectedPermissions)) {
      const descriptor = Object.getOwnPropertyDescriptor(InventoryController.prototype, method);
      expect(descriptor?.value).toBeDefined();

      // SetMetadata stores method-level metadata on the decorated function.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const metadata = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, descriptor?.value);

      expect(metadata).toEqual({
        resource: permission[0],
        action: permission[1],
      });
    }
  });
});

describe('InventoryController payload bounds', () => {
  const inventory = {
    products: jest.fn(),
    movements: jest.fn(),
    setServiceMaterials: jest.fn(),
    createPurchaseOrder: jest.fn(),
    createTransfer: jest.fn(),
  } as never;

  const controller = new InventoryController(inventory);

  it('rejects an oversized product search', () => {
    expect(() => controller.products('x'.repeat(101))).toThrow(BadRequestException);
  });

  it('rejects movement limits outside the safe range', () => {
    expect(() => controller.movements('101')).toThrow(BadRequestException);
    expect(() => controller.movements('0')).toThrow(BadRequestException);
    expect(() => controller.movements('not-a-number')).toThrow(BadRequestException);
  });

  it('rejects non-finite service material quantities', () => {
    expect(() =>
      controller.setServiceMaterials('service-1', {
        materials: [{ productId: 'product-1', quantity: Number.NaN }],
      }),
    ).toThrow(BadRequestException);
  });

  it('caps purchase order and transfer item collections', () => {
    const items = Array.from({ length: 101 }, () => ({ productId: 'product-1', quantity: 1 }));

    expect(() => controller.createPurchaseOrder({
      warehouseId: 'warehouse-1',
      items,
    } as never)).toThrow(BadRequestException);

    expect(() => controller.createTransfer({
      sourceWarehouseId: 'warehouse-1',
      destinationWarehouseId: 'warehouse-2',
      items,
    } as never)).toThrow(BadRequestException);
  });
});
