export type ExpensePaymentLifecycleStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface ExpensePaymentLine {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function expensePayableAmount(grossAmount: number, withholdingAmount: number): number {
  if (![grossAmount, withholdingAmount].every(Number.isFinite)) {
    throw new Error('Expense payment amounts must be finite.');
  }
  if (grossAmount < 0 || withholdingAmount < 0) {
    throw new Error('Expense payment amounts cannot be negative.');
  }
  if (withholdingAmount - grossAmount > 0.01) {
    throw new Error('Withholding amount cannot exceed gross amount.');
  }
  return money(grossAmount - withholdingAmount);
}

export function expensePaymentStatus(
  activePaidAmount: number,
  payableAmount: number,
): ExpensePaymentLifecycleStatus {
  if (![activePaidAmount, payableAmount].every(Number.isFinite)) {
    throw new Error('Expense payment totals must be finite.');
  }
  if (activePaidAmount < -0.01 || payableAmount < 0) {
    throw new Error('Expense payment totals cannot be negative.');
  }
  if (activePaidAmount - payableAmount > 0.01) {
    throw new Error('Expense payments cannot exceed the payable amount.');
  }
  if (payableAmount <= 0.01 || activePaidAmount <= 0.01) return 'UNPAID';
  if (Math.abs(activePaidAmount - payableAmount) <= 0.01) return 'PAID';
  return 'PARTIALLY_PAID';
}

export function assertExpensePaymentAllowed(input: {
  approvalStatus: string;
  accountingStatus: string;
  activePaidAmount: number;
  payableAmount: number;
  amount: number;
}) {
  if (input.approvalStatus !== 'APPROVED') {
    throw new Error('Only approved expenses can be paid.');
  }
  if (input.accountingStatus !== 'POSTED') {
    throw new Error('Expense must be posted to accounting before payment can be recorded.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  if (input.payableAmount <= 0.01) {
    throw new Error('Expense does not have a payable vendor balance.');
  }
  if (money(input.activePaidAmount + input.amount) - input.payableAmount > 0.01) {
    throw new Error('Payment would exceed the expense payable amount.');
  }
}

export function buildExpensePaymentLines(input: {
  payableAccountId: string;
  paymentAccountId: string;
  amount: number;
}): ExpensePaymentLine[] {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  return [
    { accountId: input.payableAccountId, debit: input.amount, credit: 0, memo: 'Gider borcu ödeme' },
    { accountId: input.paymentAccountId, debit: 0, credit: input.amount, memo: 'Nakit / banka çıkışı' },
  ];
}

export function buildExpensePaymentReversalLines(input: {
  payableAccountId: string;
  paymentAccountId: string;
  amount: number;
}): ExpensePaymentLine[] {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Reversal amount must be greater than zero.');
  }
  return [
    { accountId: input.paymentAccountId, debit: input.amount, credit: 0, memo: 'Ödeme ters kaydı - varlık hesabını geri aç' },
    { accountId: input.payableAccountId, debit: 0, credit: input.amount, memo: 'Ödeme ters kaydı - gider borcunu geri aç' },
  ];
}
