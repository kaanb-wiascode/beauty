import { assertIncomeAmounts, assertIncomeApprovalTransition } from './income-policy';

describe('income policy', () => {
  it('allows controlled approval transitions', () => {
    expect(() => assertIncomeApprovalTransition('DRAFT', 'SUBMITTED')).not.toThrow();
    expect(() => assertIncomeApprovalTransition('SUBMITTED', 'APPROVED')).not.toThrow();
  });

  it('rejects approval bypass', () => {
    expect(() => assertIncomeApprovalTransition('DRAFT', 'APPROVED')).toThrow(
      'Invalid income approval transition',
    );
  });

  it('validates balanced gross net and tax amounts', () => {
    expect(() =>
      assertIncomeAmounts({ grossAmount: 120, netAmount: 100, taxAmount: 20, exchangeRate: 1 }),
    ).not.toThrow();
  });

  it('rejects unbalanced income amounts', () => {
    expect(() =>
      assertIncomeAmounts({ grossAmount: 130, netAmount: 100, taxAmount: 20, exchangeRate: 1 }),
    ).toThrow('net amount plus tax amount to equal gross amount');
  });

  it('rejects invalid exchange rates', () => {
    expect(() =>
      assertIncomeAmounts({ grossAmount: 100, netAmount: 100, taxAmount: 0, exchangeRate: 0 }),
    ).toThrow('exchange rate must be greater than zero');
  });
});
