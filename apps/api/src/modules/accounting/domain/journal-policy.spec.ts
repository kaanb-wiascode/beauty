import { validateJournalLines } from './journal-policy';

describe('journal policy', () => {
  it('accepts a balanced double-entry journal', () => {
    expect(
      validateJournalLines([
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 1000 },
      ]),
    ).toEqual({ totalDebit: 1000, totalCredit: 1000 });
  });

  it('rejects unbalanced journals', () => {
    expect(() =>
      validateJournalLines([
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 900 },
      ]),
    ).toThrow('Journal entry is not balanced');
  });

  it('rejects lines that mix debit and credit', () => {
    expect(() =>
      validateJournalLines([
        { debit: 100, credit: 50 },
        { debit: 0, credit: 50 },
      ]),
    ).toThrow('Each journal line must contain either a debit or a credit amount.');
  });
});
