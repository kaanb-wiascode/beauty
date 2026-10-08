import {
  buildExpenseSettlementLines,
  buildIncomeSettlementLines,
  reverseJournalLines,
} from './fx-settlement-policy';

describe('FX settlement policy', () => {
  it('records FX gain when an income collection settles above document rate', () => {
    const result = buildIncomeSettlementLines({
      amount: 1000,
      documentRate: 40,
      settlementRate: 41,
      collectionAccountId: '102',
      receivableAccountId: '120',
      gainAccountId: '646',
      lossAccountId: '656',
    });

    expect(result.receivableBase).toBe(40000);
    expect(result.cashBase).toBe(41000);
    expect(result.difference).toBe(1000);
    expect(result.lines).toEqual([
      { accountId: '102', debit: 41000, credit: 0, memo: 'Gelir tahsilatı' },
      { accountId: '120', debit: 0, credit: 40000, memo: 'Gelir alacağı kapama' },
      { accountId: '646', debit: 0, credit: 1000, memo: 'Kur farkı geliri' },
    ]);
  });

  it('records FX loss when an income collection settles below document rate', () => {
    const result = buildIncomeSettlementLines({
      amount: 1000,
      documentRate: 40,
      settlementRate: 39,
      collectionAccountId: '102',
      receivableAccountId: '120',
      gainAccountId: '646',
      lossAccountId: '656',
    });

    expect(result.difference).toBe(-1000);
    expect(result.lines.at(-1)).toEqual({
      accountId: '656',
      debit: 1000,
      credit: 0,
      memo: 'Kur farkı gideri',
    });
  });

  it('records FX loss when an expense payment settles above document rate', () => {
    const result = buildExpenseSettlementLines({
      amount: 1000,
      documentRate: 40,
      settlementRate: 41,
      payableAccountId: '320',
      paymentAccountId: '102',
      gainAccountId: '646',
      lossAccountId: '656',
    });

    expect(result.payableBase).toBe(40000);
    expect(result.cashBase).toBe(41000);
    expect(result.difference).toBe(1000);
    expect(result.lines).toEqual([
      { accountId: '320', debit: 40000, credit: 0, memo: 'Gider borcu kapama' },
      { accountId: '102', debit: 0, credit: 41000, memo: 'Gider ödemesi' },
      { accountId: '656', debit: 1000, credit: 0, memo: 'Kur farkı gideri' },
    ]);
  });

  it('records FX gain when an expense payment settles below document rate', () => {
    const result = buildExpenseSettlementLines({
      amount: 1000,
      documentRate: 40,
      settlementRate: 39,
      payableAccountId: '320',
      paymentAccountId: '102',
      gainAccountId: '646',
      lossAccountId: '656',
    });

    expect(result.difference).toBe(-1000);
    expect(result.lines.at(-1)).toEqual({
      accountId: '646',
      debit: 0,
      credit: 1000,
      memo: 'Kur farkı geliri',
    });
  });

  it('reverses the original journal exactly', () => {
    expect(reverseJournalLines([
      { accountId: '102', debit: 41000, credit: 0, memo: 'Gelir tahsilatı' },
      { accountId: '120', debit: 0, credit: 40000, memo: 'Gelir alacağı kapama' },
      { accountId: '646', debit: 0, credit: 1000, memo: 'Kur farkı geliri' },
    ])).toEqual([
      { accountId: '102', debit: 0, credit: 41000, memo: 'Ters kayıt: Gelir tahsilatı' },
      { accountId: '120', debit: 40000, credit: 0, memo: 'Ters kayıt: Gelir alacağı kapama' },
      { accountId: '646', debit: 1000, credit: 0, memo: 'Ters kayıt: Kur farkı geliri' },
    ]);
  });
});
