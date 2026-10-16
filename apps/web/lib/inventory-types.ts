export type InventoryUnit = "UNIT" | "ML" | "LITER" | "GRAM" | "KG" | "METER" | "PAIR" | "BOX" | string;

export type InventoryProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  unit: InventoryUnit;
  status: string;
  quantity: number | string;
  minimumQuantity: number | string;
  targetQuantity: number | string;
  categoryName?: string | null;
  purchasePrice?: number | string;
  salePrice?: number | string;
  leadTimeDays?: number;
  shippingDays?: number;
};

export type InventoryCategory = {
  id: string;
  name: string;
  code?: string | null;
  parentId?: string | null;
  description?: string | null;
  defaultUnit?: string | null;
  isActive: boolean;
};

export type InventorySupplier = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  status: string;
};

export type InventoryWarehouse = {
  id: string;
  name: string;
  type: string;
  branchId?: string | null;
};

export type InventoryAsset = {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  status: string;
  condition: string;
  branchId?: string | null;
  branchName?: string | null;
  assignedTo?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | string;
  currency: string;
  warrantyEnd?: string | null;
  nextMaintenanceAt?: string | null;
  categoryName?: string | null;
};

export type InventoryPurchaseRequestSummary = {
  id?: string;
  status: string;
};

export type InventoryOverview = {
  metrics: {
    totalProducts: number;
    criticalProducts: number;
    inventoryValue: number | string;
  };
  critical: InventoryProduct[];
  warehouses: InventoryWarehouse[];
  purchaseRequests: InventoryPurchaseRequestSummary[];
  assetCount: number;
  expiringLots: number;
};

export type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  manufacturer: string;
  model: string;
  description: string;
  categoryId: string;
  unit: string;
  packageQuantity: string;
  originCountry: string;
  trackStock: boolean;
  trackExpiry: boolean;
  minimumQuantity: string;
  targetQuantity: string;
  initialQuantity: string;
  purchasePrice: string;
  salePrice: string;
  taxRate: string;
  currency: string;
  minimumOrderQuantity: string;
  orderMultiple: string;
  leadTimeDays: string;
  preparationDays: string;
  shippingDays: string;
  returnable: boolean;
  supplierId: string;
  supplierProductCode: string;
  supplierUnitCost: string;
  supplierMinimumOrderQuantity: string;
  supplierOrderMultiple: string;
  supplierLeadTimeDays: string;
  supplierPreparationDays: string;
  supplierShippingDays: string;
  lotNumber: string;
  manufacturedAt: string;
  expiresAt: string;
  serviceNotes: string;
};

export type AssetFormState = {
  name: string;
  assetCode: string;
  assetType: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: string;
  condition: string;
  branchId: string;
  warehouseId: string;
  purchaseDate: string;
  supplierId: string;
  invoiceNumber: string;
  purchasePrice: string;
  currency: string;
  warrantyStart: string;
  warrantyEnd: string;
  maintenanceIntervalDays: string;
  nextMaintenanceAt: string;
  notes: string;
};

export const INVENTORY_UNITS = ["UNIT", "ML", "LITER", "GRAM", "KG", "METER", "PAIR", "BOX"] as const;

export const INVENTORY_UNIT_LABELS: Record<string, string> = {
  UNIT: "Adet",
  ML: "Mililitre",
  LITER: "Litre",
  GRAM: "Gram",
  KG: "Kilogram",
  METER: "Metre",
  PAIR: "Çift",
  BOX: "Kutu",
};

export const INVENTORY_ASSET_TYPE_LABELS: Record<string, string> = {
  EQUIPMENT: "Cihaz / Ekipman",
  FURNITURE: "Mobilya",
  IT: "Bilgi Teknolojileri",
  VEHICLE: "Araç",
  OTHER: "Diğer",
};

export const INVENTORY_ASSET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  MAINTENANCE: "Bakımda",
  RETIRED: "Kullanımdan Kaldırıldı",
};

export const INVENTORY_ASSET_CONDITION_LABELS: Record<string, string> = {
  GOOD: "İyi",
  FAIR: "Orta",
  POOR: "Yıpranmış",
  BROKEN: "Arızalı",
};

export function formatInventoryQuantity(value: unknown) {
  return Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

export function formatInventoryMoney(value: unknown, currency = "TRY") {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function inventoryUnitLabel(value: string) {
  return INVENTORY_UNIT_LABELS[value] ?? value;
}

export function inventoryAssetTypeLabel(value: string) {
  return INVENTORY_ASSET_TYPE_LABELS[value] ?? value;
}

export function inventoryAssetStatusLabel(value: string) {
  return INVENTORY_ASSET_STATUS_LABELS[value] ?? value;
}

export function inventoryAssetConditionLabel(value: string) {
  return INVENTORY_ASSET_CONDITION_LABELS[value] ?? value;
}
