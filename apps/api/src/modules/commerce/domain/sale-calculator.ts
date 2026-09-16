export interface SaleLineInput {
  quantity: number;
  unitPrice: number;
}

export interface SaleTotals {
  subtotal: number;
  discountTotal: number;
  total: number;
}

const toMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSaleTotals(
  lines: SaleLineInput[],
  discountTotal = 0,
): SaleTotals {
  if (lines.length === 0) {
    throw new Error('A sale must contain at least one line.');
  }

  if (discountTotal < 0) {
    throw new Error('Discount cannot be negative.');
  }

  const subtotal = toMoney(
    lines.reduce((sum, line) => {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error('Sale line quantity must be a positive integer.');
      }

      if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        throw new Error('Sale line unit price must be a non-negative number.');
      }

      return sum + line.quantity * line.unitPrice;
    }, 0),
  );

  const normalizedDiscount = toMoney(discountTotal);

  if (normalizedDiscount > subtotal) {
    throw new Error('Discount cannot exceed subtotal.');
  }

  return {
    subtotal,
    discountTotal: normalizedDiscount,
    total: toMoney(subtotal - normalizedDiscount),
  };
}
