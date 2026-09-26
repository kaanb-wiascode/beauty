import { buildExpensePostingLines } from './expense-accounting-policy';

describe('expense accounting policy', () => {
  it('builds a balanced expense journal without withholding', () => {
    const lines = buildExpensePostingLines({
      grossAmount: 120,
      netAmount: 100,
      taxAmount: 20,
      withholdingAmount: 0,
      expenseAccountId: 'expense',
      taxAccountId: 'tax',
      payableAccountId: 'payable',
    });

    expect(lines).toEqual([
      { accountId: 'expense', debit: 100, credit: 0, memo: 'Gider tahakkuku' },
      { accountId: 'tax', debit: 20, credit: 0, memo: 'Vergi' },
      { accountId: 'payable', debit: 0, credit: 120, memo: 'Gider borcu' },
    ]);
  });

  it('splits withholding into a dedicated liability and reduces payable', () => {
    const lines = buildExpensePostingLines({
      grossAmount: 120,
      netAmount: 100,
      taxAmount: 20,
      withholdingAmount: 15,
      expenseAccountId: 'expense',
      taxAccountId: 'tax',
      payableAccountId: 'payable',
      withholdingAccountId: 'withholding',
    });

    expect(lines).toEqual([
      { accountId: 'expense', debit: 100, credit: 0, memo: 'Gider tahakkuku' },
      { accountId: 'tax', debit: 20, credit: 0, memo: 'Vergi' },
      { accountId: 'payable', debit: 0, credit: 105, memo: 'Gider borcu' },
      { accountId: 'withholding', debit: 0, credit: 15, memo: 'Stopaj / tevkifat borcu' },
    ]);
  });

  it('requires a tax account when tax exists', () => {
    expect(() =>
      buildExpensePostingLines({
        grossAmount: 120,
        netAmount: 100,
        taxAmount: 20,
        withholdingAmount: 0,
        expenseAccountId: 'expense',
        payableAccountId: 'payable',
      }),
    ).toThrow('Tax account mapping is required');
  });

  it('requires a withholding account when withholding exists', () => {
    expect(() =>
      buildExpensePostingLines({
        grossAmount: 100,
        netAmount: 100,
        taxAmount: 0,
        withholdingAmount: 10,
        expenseAccountId: 'expense',
        payableAccountId: 'payable',
      }),
    ).toThrow('Withholding account mapping is required');
  });

  it('rejects an unbalanced gross/net/tax relationship', () => {
    expect(() =>
      buildExpensePostingLines({
        grossAmount: 130,
        netAmount: 100,
        taxAmount: 20,
        withholdingAmount: 0,
        expenseAccountId: 'expense',
        taxAccountId: 'tax',
        payableAccountId: 'payable',
      }),
    ).toThrow('net amount plus tax amount to equal gross amount');
  });

  it('rejects withholding greater than gross amount', () => {
    expect(() =>
      buildExpensePostingLines({
        grossAmount: 100,
        netAmount: 100,
        taxAmount: 0,
        withholdingAmount: 101,
        expenseAccountId: 'expense',
        payableAccountId: 'payable',
        withholdingAccountId: 'withholding',
      }),
    ).toThrow('Withholding amount cannot exceed gross amount');
  });
});
