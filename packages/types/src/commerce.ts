export const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const CUSTOMER_PACKAGE_STATUSES = ['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const;
export type CustomerPackageStatus = (typeof CUSTOMER_PACKAGE_STATUSES)[number];

export const SESSION_STATUSES = ['AVAILABLE', 'RESERVED', 'CONSUMED', 'CANCELLED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['COMPLETED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

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

export interface SalePaymentContract {
  id: string;
  tenantId: string;
  branchId: string;
  saleId: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  refundedAt: string | null;
  refundReason: string | null;
  reference: string | null;
  note: string | null;
}

export interface SaleBalanceContract {
  saleId: string;
  total: string;
  paid: string;
  refunded: string;
  outstanding: string;
}
