export const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const CUSTOMER_PACKAGE_STATUSES = ['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const;
export type CustomerPackageStatus = (typeof CUSTOMER_PACKAGE_STATUSES)[number];

export const SESSION_STATUSES = ['AVAILABLE', 'RESERVED', 'CONSUMED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface PackageItemContract {
  id: string;
  serviceId: string;
  quantity: number;
}

export interface ServicePackageContract {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  description: string | null;
  price: string;
  validityDays: number | null;
  active: boolean;
  items: PackageItemContract[];
}

export interface CustomerPackageContract {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  packageId: string;
  saleId: string;
  status: CustomerPackageStatus;
  purchasedAt: string;
  expiresAt: string | null;
}

export interface SessionContract {
  id: string;
  tenantId: string;
  branchId: string;
  customerPackageId: string;
  serviceId: string;
  appointmentId: string | null;
  status: SessionStatus;
  consumedAt: string | null;
}

export interface SaleContract {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  status: SaleStatus;
  subtotal: string;
  discountTotal: string;
  total: string;
  createdAt: string;
}
