import { buildIncomeAccrualJournalLines } from './income-accounting-policy';

describe('income accounting policy', () => {
  const mapping = {
    revenueAccountId: 'revenue',
    taxAccountId: 'tax',
    receivableAccountId: 'receivable',
  };

  it('builds a balanced income accrual journal', () => {
    const lines = buildIncomeAccrualJournalLines(
      { grossAmount: 120, netAmount: 100, taxAmount: 20 },
      mapping,
    );
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(120);
    expect(lines.reduce((sum, line) => sum + line.credit, 0)).toBe(120);
  });

  it('omits tax line for tax-free income', () => {
    const lines = buildIncomeAccrualJournalLines(
      { grossAmount: 100, netAmount: 100, taxAmount: 0 },
      { ...mapping, taxAccountId: null },
    );
    expect(lines).toHaveLength(2);
  });

  it('requires tax mapping when tax exists', () => {
    expect(() =>
      buildIncomeAccrualJournalLines(
        { grossAmount: 120, netAmount: 100, taxAmount: 20 },
        { ...mapping, taxAccountId: null },
      ),
    ).toThrow('Tax account mapping is required');
  });

  it('rejects an unbalanced gross amount', () => {
    expect(() =>
      buildIncomeAccrualJournalLines(
        { grossAmount: 121, netAmount: 100, taxAmount: 20 },
        mapping,
      ),
    ).toThrow('net amount plus tax amount');
  });
});
