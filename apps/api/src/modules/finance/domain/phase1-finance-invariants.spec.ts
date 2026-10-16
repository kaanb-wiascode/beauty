import { buildExpensePostingLines } from './expense-accounting-policy';
import {
  assertExpensePaymentAllowed,
  buildExpensePaymentLines,
  buildExpensePaymentReversalLines,
  expensePayableAmount,
  expensePaymentStatus,
} from './expense-payment-policy';
import { assertExpenseAccountingTransition } from './expense-policy';
import { buildIncomeAccrualJournalLines } from './income-accounting-policy';
import {
  assertCollectionDoesNotExceedGross,
  buildCollectionReversalLines,
  deriveIncomeCollectionStatus,
} from './income-collection-policy';

function totals(lines: readonly { debit: number; credit: number }[]) {
  return lines.reduce(
    (result, line) => ({ debit: result.debit + line.debit, credit: result.credit + line.credit }),
    { debit: 0, credit: 0 },
  );
}

describe('phase 1 finance invariants', () => {
  it('keeps expense accrual, payment and reversal journals balanced end-to-end', () => {
    const accrual = buildExpensePostingLines({
      grossAmount: 1200,
      netAmount: 1000,
      taxAmount: 200,
      withholdingAmount: 100,
      expenseAccountId: 'expense',
      taxAccountId: 'tax',
      payableAccountId: 'payable',
      withholdingAccountId: 'withholding',
    });
    expect(totals(accrual)).toEqual({ debit: 1200, credit: 1200 });

    const payable = expensePayableAmount(1200, 100);
    expect(payable).toBe(1100);

    assertExpensePaymentAllowed({
      approvalStatus: 'APPROVED',
      accountingStatus: 'POSTED',
      activePaidAmount: 0,
      payableAmount: payable,
      amount: 400,
    });
    expect(expensePaymentStatus(400, payable)).toBe('PARTIALLY_PAID');

    const payment = buildExpensePaymentLines({
      payableAccountId: 'payable',
      paymentAccountId: 'bank',
      amount: 400,
    });
    expect(totals(payment)).toEqual({ debit: 400, credit: 400 });

    const reversal = buildExpensePaymentReversalLines({
      payableAccountId: 'payable',
      paymentAccountId: 'bank',
      amount: 400,
    });
    expect(totals(reversal)).toEqual({ debit: 400, credit: 400 });
    expect(expensePaymentStatus(0, payable)).toBe('UNPAID');
  });

  it('prevents expense overpayment and requires accounting reversal instead of reopening', () => {
    expect(() =>
      assertExpensePaymentAllowed({
        approvalStatus: 'APPROVED',
        accountingStatus: 'POSTED',
        activePaidAmount: 900,
        payableAmount: 1000,
        amount: 101,
      }),
    ).toThrow('exceed');

    expect(() =>
      assertExpenseAccountingTransition({
        approvalStatus: 'APPROVED',
        current: 'POSTED',
        next: 'UNPOSTED',
        hasAccountingMapping: true,
      }),
    ).toThrow('Invalid expense accounting transition');
  });

  it('keeps income accrual and collection reversal balanced through partial and full collection', () => {
    const accrual = buildIncomeAccrualJournalLines(
      { grossAmount: 1200, netAmount: 1000, taxAmount: 200 },
      { revenueAccountId: 'revenue', taxAccountId: 'tax', receivableAccountId: 'receivable' },
    );
    expect(totals(accrual)).toEqual({ debit: 1200, credit: 1200 });

    assertCollectionDoesNotExceedGross(1200, 0, 450);
    expect(deriveIncomeCollectionStatus(1200, 450)).toBe('PARTIALLY_COLLECTED');
    assertCollectionDoesNotExceedGross(1200, 450, 750);
    expect(deriveIncomeCollectionStatus(1200, 1200)).toBe('COLLECTED');

    const reversal = buildCollectionReversalLines('receivable', 'bank', 750);
    expect(totals(reversal)).toEqual({ debit: 750, credit: 750 });
    expect(deriveIncomeCollectionStatus(1200, 450)).toBe('PARTIALLY_COLLECTED');
  });

  it('prevents income overcollection even within chained collections', () => {
    expect(() => assertCollectionDoesNotExceedGross(1000, 800, 200.02)).toThrow('exceed');
  });
});
