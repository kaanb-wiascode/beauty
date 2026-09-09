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
