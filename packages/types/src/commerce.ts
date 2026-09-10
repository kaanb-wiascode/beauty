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

export const CUSTOMER_LEDGER_ENTRY_TYPES = ['SALE', 'PAYMENT', 'REFUND'] as const;
export type CustomerLedgerEntryType = (typeof CUSTOMER_LEDGER_ENTRY_TYPES)[number];

export const CUSTOMER_LEDGER_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'SETTLED'] as const;
export type CustomerLedgerStatus = (typeof CUSTOMER_LEDGER_STATUSES)[number];

export const INSTALLMENT_RUNTIME_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const;
export type InstallmentRuntimeStatus = (typeof INSTALLMENT_RUNTIME_STATUSES)[number];

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const JOURNAL_ENTRY_STATUSES = ['DRAFT', 'POSTED', 'REVERSED'] as const;
export type JournalEntryStatus = (typeof JOURNAL_ENTRY_STATUSES)[number];

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

export interface CustomerLedgerEntryContract {
  id: string;
  type: CustomerLedgerEntryType;
  occurredAt: string;
  description: string;
  debit: number;
  credit: number;
  saleId: string;
  paymentId: string | null;
  paymentMethod: PaymentMethod | null;
  runningBalance: number;
}

export interface CustomerLedgerSummaryContract {
  totalSales: number;
  grossPaid: number;
  totalRefunded: number;
  netPaid: number;
  balance: number;
  status: CustomerLedgerStatus;
}

export interface PlannedInstallmentContract {
  sequence: number;
  amount: number;
  dueAt: string;
}

export interface InstallmentSummaryContract extends PlannedInstallmentContract {
  paidAmount: number;
  outstanding: number;
  status: InstallmentRuntimeStatus;
}

export interface ChartOfAccountContract {
  id: string;
  tenantId: string;
  companyId: string;
  code: string;
  name: string;
  type: AccountType;
  active: boolean;
  parentId: string | null;
}

export interface JournalEntryLineContract {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  memo: string | null;
}

export interface JournalEntryContract {
  id: string;
  tenantId: string;
  companyId: string;
  branchId: string | null;
  number: string;
  status: JournalEntryStatus;
  entryDate: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  postedAt: string | null;
  lines: JournalEntryLineContract[];
}
