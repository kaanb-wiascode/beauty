export interface ExpensePostingInput {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  withholdingAmount: number;
  expenseAccountId: string;
  taxAccountId?: string | null;
  payableAccountId: string;
  withholdingAccountId?: string | null;
}

export interface ExpensePostingLine {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
}

export function buildExpensePostingLines(input: ExpensePostingInput): ExpensePostingLine[] {
  const {
    grossAmount,
    netAmount,
    taxAmount,
    withholdingAmount,
    expenseAccountId,
    taxAccountId,
    payableAccountId,
    withholdingAccountId,
  } = input;

  if ([grossAmount, netAmount, taxAmount, withholdingAmount].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expense posting amounts must be finite and non-negative.');
  }

  if (Math.abs(netAmount + taxAmount - grossAmount) > 0.01) {
    throw new Error('Expense accounting requires net amount plus tax amount to equal gross amount.');
  }

  if (withholdingAmount > grossAmount) {
    throw new Error('Withholding amount cannot exceed gross amount.');
  }

  if (taxAmount > 0 && !taxAccountId) {
    throw new Error('Tax account mapping is required when tax amount is greater than zero.');
  }

  if (withholdingAmount > 0 && !withholdingAccountId) {
    throw new Error('Withholding account mapping is required when withholding amount is greater than zero.');
  }

  const payableAmount = Math.round((grossAmount - withholdingAmount + Number.EPSILON) * 100) / 100;
  const lines: ExpensePostingLine[] = [
    { accountId: expenseAccountId, debit: netAmount, credit: 0, memo: 'Gider tahakkuku' },
  ];

  if (taxAmount > 0 && taxAccountId) {
    lines.push({ accountId: taxAccountId, debit: taxAmount, credit: 0, memo: 'Vergi' });
  }

  if (payableAmount > 0) {
    lines.push({ accountId: payableAccountId, debit: 0, credit: payableAmount, memo: 'Gider borcu' });
  }

  if (withholdingAmount > 0 && withholdingAccountId) {
    lines.push({
      accountId: withholdingAccountId,
      debit: 0,
      credit: withholdingAmount,
      memo: 'Stopaj / tevkifat borcu',
    });
  }

  return lines;
}
