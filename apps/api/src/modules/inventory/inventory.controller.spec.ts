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
