export type ExpenseApprovalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type ExpensePaymentStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED';

export type ExpenseAccountingStatus =
  | 'UNPOSTED'
  | 'READY_TO_POST'
  | 'POSTED'
  | 'REVERSED';

const APPROVAL_TRANSITIONS: Record<
  ExpenseApprovalStatus,
  readonly ExpenseApprovalStatus[]
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  // Once approved, cancellation must be handled through the reversal-aware
  // payment/accounting workflow. Allowing a direct approval-state change here
  // can orphan payment or journal state from the expense aggregate.
  APPROVED: [],
  REJECTED: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
};

export function assertExpenseApprovalTransition(
  current: ExpenseApprovalStatus,
  next: ExpenseApprovalStatus,
): void {
  if (current === next) return;

  if (!APPROVAL_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid expense approval transition: ${current} -> ${next}`);
  }
}

export function assertExpensePaymentTransition(input: {
  approvalStatus: ExpenseApprovalStatus;
  current: ExpensePaymentStatus;
  next: ExpensePaymentStatus;
}): void {
  const { approvalStatus, current, next } = input;
  if (current === next) return;

  if (approvalStatus !== 'APPROVED') {
    throw new Error('Expense must be approved before payment state can advance');
  }

  const transitions: Record<ExpensePaymentStatus, readonly ExpensePaymentStatus[]> = {
    UNPAID: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    PARTIALLY_PAID: ['PAID', 'CANCELLED'],
    PAID: [],
    CANCELLED: [],
  };

  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid expense payment transition: ${current} -> ${next}`);
  }
}

export function assertExpenseAccountingTransition(input: {
  approvalStatus: ExpenseApprovalStatus;
  current: ExpenseAccountingStatus;
  next: ExpenseAccountingStatus;
  hasAccountingMapping: boolean;
}): void {
  const { approvalStatus, current, next, hasAccountingMapping } = input;
  if (current === next) return;

  if (next === 'READY_TO_POST') {
    if (approvalStatus !== 'APPROVED') {
      throw new Error('Only approved expenses can become ready to post');
    }
    if (!hasAccountingMapping) {
      throw new Error('Expense category requires an accounting mapping before posting');
    }
  }

  const transitions: Record<ExpenseAccountingStatus, readonly ExpenseAccountingStatus[]> = {
    UNPOSTED: ['READY_TO_POST'],
    READY_TO_POST: ['POSTED', 'UNPOSTED'],
    POSTED: ['REVERSED'],
    REVERSED: [],
  };

  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid expense accounting transition: ${current} -> ${next}`);
  }
}

export function assertExpenseAmounts(input: {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  withholdingAmount: number;
  exchangeRate: number;
}): void {
  const { grossAmount, netAmount, taxAmount, withholdingAmount, exchangeRate } = input;

  if (
    [grossAmount, netAmount, taxAmount, withholdingAmount].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new Error('Expense monetary amounts must be finite and non-negative');
  }

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Expense exchange rate must be greater than zero');
  }
}
