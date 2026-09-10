export type InventoryUnit = 'UNIT' | 'ML' | 'LITER' | 'GRAM' | 'KG' | 'METER' | 'PAIR' | 'BOX';

export interface InventoryCategoryInput {
  name: string;
  code?: string;
  parentId?: string | null;
  description?: string | null;
  defaultUnit?: InventoryUnit | null;
}

export interface InventoryMovementInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  type: string;
  unitCost?: number;
  referenceId?: string;
  note?: string;
}

export interface InventoryMaterialInput {
  productId: string;
  quantity: number;
}

export interface InventoryMaterialsInput {
  materials: InventoryMaterialInput[];
}

export interface InventorySupplierInput {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  address?: string;
  notes?: string;
}

export interface InventoryProductInput {
  name: string;
  unit?: InventoryUnit;
  warehouseId?: string;
  categoryId?: string | null;
  sku?: string;
  barcode?: string;
  brand?: string;
  manufacturer?: string;
  model?: string;
  description?: string;
  originCountry?: string;
  packageQuantity?: number;
  trackStock?: boolean;
  trackExpiry?: boolean;
  taxRate?: number;
  purchasePrice?: number;
  salePrice?: number;
  currency?: string;
  minimumOrderQuantity?: number;
  orderMultiple?: number;
  leadTimeDays?: number;
  preparationDays?: number;
  shippingDays?: number;
  returnable?: boolean;
  imageUrl?: string;
  notes?: string;
  initialQuantity?: number;
  minimumQuantity?: number;
  targetQuantity?: number;
  supplierId?: string;
  supplierProductCode?: string;
  isPrimary?: boolean;
  unitCost?: number;
  supplierMinimumOrderQuantity?: number;
  supplierOrderMultiple?: number;
  supplierLeadTimeDays?: number;
  supplierPreparationDays?: number;
  supplierShippingDays?: number;
}

export interface InventoryAssetInput {
  categoryId?: string | null;
  assetCode: string;
  name: string;
  assetType?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  status?: string;
  condition?: string;
  branchId?: string | null;
  warehouseId?: string | null;
  assignedToStaffId?: string | null;
  purchaseDate?: string | null;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  purchasePrice?: number;
  currency?: string;
  warrantyStart?: string | null;
  warrantyEnd?: string | null;
  maintenanceIntervalDays?: number | null;
  nextMaintenanceAt?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
}

export interface InventoryAssetMaintenanceInput {
  assetId: string;
  type?: string;
  status?: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  provider?: string | null;
  cost?: number;
  currency?: string;
  description?: string | null;
}

export interface InventoryPurchaseOrderItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export interface InventoryPurchaseOrderInput {
  warehouseId: string;
  supplierId?: string | null;
  status?: string;
  totalAmount?: number;
  note?: string | null;
  orderedAt?: string | null;
  items: InventoryPurchaseOrderItemInput[];
}

export interface InventoryTransferItemInput {
  productId: string;
  quantity: number;
}

export interface InventoryTransferInput {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  note?: string;
  items: InventoryTransferItemInput[];
}
