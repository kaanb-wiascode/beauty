import {
  assertExpenseAccountingTransition,
  assertExpenseAmounts,
  assertExpenseApprovalTransition,
  assertExpensePaymentTransition,
} from './expense-policy';

describe('expense policy', () => {
  it('allows the controlled approval lifecycle', () => {
    expect(() => assertExpenseApprovalTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    expect(() => assertExpenseApprovalTransition('SUBMITTED', 'APPROVED')).not.toThrow();
  });

  it('rejects bypassing approval', () => {
    expect(() => assertExpenseApprovalTransition('DRAFT', 'APPROVED')).toThrow(
      'Invalid expense approval transition',
    );
  });

  it('blocks payment progress until approval', () => {
    expect(() =>
      assertExpensePaymentTransition({
        approvalStatus: 'SUBMITTED',
        current: 'UNPAID',
        next: 'PAID',
      }),
    ).toThrow('Expense must be approved');
  });

  it('allows approved partial and full payment states', () => {
    expect(() =>
      assertExpensePaymentTransition({
        approvalStatus: 'APPROVED',
        current: 'UNPAID',
        next: 'PARTIALLY_PAID',
      }),
    ).not.toThrow();

    expect(() =>
      assertExpensePaymentTransition({
        approvalStatus: 'APPROVED',
        current: 'PARTIALLY_PAID',
        next: 'PAID',
      }),
    ).not.toThrow();
  });

  it('requires accounting mapping before an expense becomes ready to post', () => {
    expect(() =>
      assertExpenseAccountingTransition({
        approvalStatus: 'APPROVED',
        current: 'UNPOSTED',
        next: 'READY_TO_POST',
        hasAccountingMapping: false,
      }),
    ).toThrow('requires an accounting mapping');
  });

  it('uses reversal instead of reopening a posted expense', () => {
    expect(() =>
      assertExpenseAccountingTransition({
        approvalStatus: 'APPROVED',
        current: 'POSTED',
        next: 'UNPOSTED',
        hasAccountingMapping: true,
      }),
    ).toThrow('Invalid expense accounting transition');

    expect(() =>
      assertExpenseAccountingTransition({
        approvalStatus: 'APPROVED',
        current: 'POSTED',
        next: 'REVERSED',
        hasAccountingMapping: true,
      }),
    ).not.toThrow();
  });

  it('rejects negative money and invalid FX rates', () => {
    expect(() =>
      assertExpenseAmounts({
        grossAmount: -1,
        netAmount: 0,
        taxAmount: 0,
        withholdingAmount: 0,
        exchangeRate: 1,
      }),
    ).toThrow('non-negative');

    expect(() =>
      assertExpenseAmounts({
        grossAmount: 100,
        netAmount: 100,
        taxAmount: 0,
        withholdingAmount: 0,
        exchangeRate: 0,
      }),
    ).toThrow('greater than zero');
  });
});
