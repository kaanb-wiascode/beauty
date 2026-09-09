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
