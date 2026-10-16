import {
  assertExpensePaymentAllowed,
  buildExpensePaymentLines,
  buildExpensePaymentReversalLines,
  expensePayableAmount,
  expensePaymentStatus,
} from './expense-payment-policy';

describe('expense payment policy', () => {
  it('calculates vendor payable after withholding', () => {
    expect(expensePayableAmount(1200, 200)).toBe(1000);
  });

  it('maps active payment totals to lifecycle status', () => {
    expect(expensePaymentStatus(0, 1000)).toBe('UNPAID');
    expect(expensePaymentStatus(250, 1000)).toBe('PARTIALLY_PAID');
    expect(expensePaymentStatus(1000, 1000)).toBe('PAID');
  });

  it('blocks payment before approval or accounting posting', () => {
    expect(() => assertExpensePaymentAllowed({
      approvalStatus: 'SUBMITTED',
      accountingStatus: 'POSTED',
      activePaidAmount: 0,
      payableAmount: 1000,
      amount: 100,
    })).toThrow('Only approved expenses can be paid.');

    expect(() => assertExpensePaymentAllowed({
      approvalStatus: 'APPROVED',
      accountingStatus: 'READY_TO_POST',
      activePaidAmount: 0,
      payableAmount: 1000,
      amount: 100,
    })).toThrow('Expense must be posted to accounting before payment can be recorded.');
  });

  it('prevents overpayment of vendor liability', () => {
    expect(() => assertExpensePaymentAllowed({
      approvalStatus: 'APPROVED',
      accountingStatus: 'POSTED',
      activePaidAmount: 900,
      payableAmount: 1000,
      amount: 100.02,
    })).toThrow('Payment would exceed the expense payable amount.');
  });

  it('builds balanced payment and reversal journal lines', () => {
    expect(buildExpensePaymentLines({
      payableAccountId: 'payable',
      paymentAccountId: 'bank',
      amount: 400,
    })).toEqual([
      { accountId: 'payable', debit: 400, credit: 0, memo: 'Gider borcu ödeme' },
      { accountId: 'bank', debit: 0, credit: 400, memo: 'Nakit / banka çıkışı' },
    ]);

    expect(buildExpensePaymentReversalLines({
      payableAccountId: 'payable',
      paymentAccountId: 'bank',
      amount: 400,
    })).toEqual([
      { accountId: 'bank', debit: 400, credit: 0, memo: 'Ödeme ters kaydı - varlık hesabını geri aç' },
      { accountId: 'payable', debit: 0, credit: 400, memo: 'Ödeme ters kaydı - gider borcunu geri aç' },
    ]);
  });

  it('reopens a paid expense after a full payment reversal', () => {
    expect(expensePaymentStatus(1000, 1000)).toBe('PAID');
    expect(expensePaymentStatus(0, 1000)).toBe('UNPAID');
  });
});
