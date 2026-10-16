export type IncomeApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

const APPROVAL_TRANSITIONS: Record<IncomeApprovalStatus, readonly IncomeApprovalStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
};

export function assertIncomeApprovalTransition(current: IncomeApprovalStatus, next: IncomeApprovalStatus): void {
  if (current === next) return;
  if (!APPROVAL_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid income approval transition: ${current} -> ${next}`);
  }
}

export function assertIncomeAmounts(input: {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  exchangeRate: number;
}): void {
  const { grossAmount, netAmount, taxAmount, exchangeRate } = input;
  if ([grossAmount, netAmount, taxAmount].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Income monetary amounts must be finite and non-negative');
  }
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Income exchange rate must be greater than zero');
  }
  if (Math.abs(netAmount + taxAmount - grossAmount) > 0.01) {
    throw new Error('Income accounting requires net amount plus tax amount to equal gross amount');
  }
}
