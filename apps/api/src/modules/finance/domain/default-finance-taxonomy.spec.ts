import { DEFAULT_EXPENSE_TAXONOMY, DEFAULT_INCOME_TAXONOMY } from './default-finance-taxonomy';

function flattenCodes(
  taxonomy: readonly { code: string; children?: readonly { code: string }[] }[],
) {
  return taxonomy.flatMap((category) => [
    category.code,
    ...(category.children ?? []).map((child) => child.code),
  ]);
}

describe('default finance taxonomy', () => {
  it('keeps expense category codes unique', () => {
    const codes = flattenCodes(DEFAULT_EXPENSE_TAXONOMY);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps income category codes unique', () => {
    const codes = flattenCodes(DEFAULT_INCOME_TAXONOMY);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('includes required operational expense domains', () => {
    const codes = new Set(flattenCodes(DEFAULT_EXPENSE_TAXONOMY));
    expect(codes).toEqual(
      expect.objectContaining({
        size: expect.any(Number),
      }),
    );
    expect(codes.has('FACILITY_RENT')).toBe(true);
    expect(codes.has('STATUTORY_SGK')).toBe(true);
    expect(codes.has('PERSONNEL_ADVANCE')).toBe(true);
    expect(codes.has('PERSONNEL_PER_DIEM')).toBe(true);
    expect(codes.has('FINANCIAL_BANK_FEE')).toBe(true);
    expect(codes.has('ADMIN_SUBSCRIPTIONS')).toBe(true);
  });

  it('includes non-sale income sources required by operational finance', () => {
    const codes = new Set(flattenCodes(DEFAULT_INCOME_TAXONOMY));
    expect(codes.has('INCOME_INTEREST')).toBe(true);
    expect(codes.has('INCOME_SUPPLIER_REFUND')).toBe(true);
    expect(codes.has('INCOME_INSURANCE')).toBe(true);
    expect(codes.has('INCOME_GOVERNMENT_SUPPORT')).toBe(true);
    expect(codes.has('INCOME_ASSET_SALE')).toBe(true);
    expect(codes.has('INCOME_CAPITAL_CONTRIBUTION')).toBe(true);
  });
});
