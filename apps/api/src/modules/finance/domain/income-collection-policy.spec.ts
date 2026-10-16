import {
  assertCollectionDoesNotExceedGross,
  buildCollectionReversalLines,
  deriveIncomeCollectionStatus,
} from './income-collection-policy';

describe('income collection policy', () => {
  it('derives uncollected, partial and collected states', () => {
    expect(deriveIncomeCollectionStatus(1000, 0)).toBe('UNCOLLECTED');
    expect(deriveIncomeCollectionStatus(1000, 250)).toBe('PARTIALLY_COLLECTED');
    expect(deriveIncomeCollectionStatus(1000, 1000)).toBe('COLLECTED');
  });

  it('accepts cent-level rounding tolerance for a fully collected income', () => {
    expect(deriveIncomeCollectionStatus(1000, 999.995)).toBe('COLLECTED');
  });

  it('rejects over-collection', () => {
    expect(() => assertCollectionDoesNotExceedGross(1000, 900, 100.02)).toThrow(
      'Collection would exceed the income gross amount.',
    );
  });

  it('builds a balanced full reversal entry', () => {
    const lines = buildCollectionReversalLines('receivable', 'bank', 450);
    expect(lines).toEqual([
      { accountId: 'receivable', debit: 450, credit: 0, memo: 'Tahsilat ters kaydı - alacağı yeniden aç' },
      { accountId: 'bank', debit: 0, credit: 450, memo: 'Tahsilat ters kaydı - varlık hesabını azalt' },
    ]);
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(
      lines.reduce((sum, line) => sum + line.credit, 0),
    );
  });

  it('reopens an income after a full collection is reversed', () => {
    expect(deriveIncomeCollectionStatus(1000, 1000)).toBe('COLLECTED');
    expect(deriveIncomeCollectionStatus(1000, 0)).toBe('UNCOLLECTED');
  });
});
