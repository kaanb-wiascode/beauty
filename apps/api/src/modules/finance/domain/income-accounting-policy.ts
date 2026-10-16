export interface IncomeAccountingAmounts {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
}

export interface IncomeAccountingMapping {
  revenueAccountId: string;
  taxAccountId?: string | null;
  receivableAccountId: string;
}

export interface IncomeJournalLine {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
}

export function buildIncomeAccrualJournalLines(
  amounts: IncomeAccountingAmounts,
  mapping: IncomeAccountingMapping,
): IncomeJournalLine[] {
  const { grossAmount, netAmount, taxAmount } = amounts;

  if (![grossAmount, netAmount, taxAmount].every(Number.isFinite)) {
    throw new Error('Income accounting amounts must be finite.');
  }
  if (grossAmount < 0 || netAmount < 0 || taxAmount < 0) {
    throw new Error('Income accounting amounts must be non-negative.');
  }
  if (Math.abs(netAmount + taxAmount - grossAmount) > 0.01) {
    throw new Error('Income accounting requires net amount plus tax amount to equal gross amount.');
  }
  if (taxAmount > 0 && !mapping.taxAccountId) {
    throw new Error('Tax account mapping is required when income tax amount is greater than zero.');
  }

  return [
    {
      accountId: mapping.receivableAccountId,
      debit: grossAmount,
      credit: 0,
      memo: 'Gelir alacağı',
    },
    {
      accountId: mapping.revenueAccountId,
      debit: 0,
      credit: netAmount,
      memo: 'Gelir tahakkuku',
    },
    ...(taxAmount > 0 && mapping.taxAccountId
      ? [
          {
            accountId: mapping.taxAccountId,
            debit: 0,
            credit: taxAmount,
            memo: 'Hesaplanan vergi',
          },
        ]
      : []),
  ];
}
