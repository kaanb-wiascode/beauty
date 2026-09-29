export interface SaleLineInput {
  quantity: number;
  unitPrice: number;
}

export interface SaleTotals {
  subtotal: number;
  discountTotal: number;
  total: number;
}

const toMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSaleTotals(
  lines: SaleLineInput[],
  discountTotal = 0,
): SaleTotals {
  if (lines.length === 0) {
    throw new Error('Satışta en az bir kalem bulunmalıdır.');
  }

  if (discountTotal < 0) {
    throw new Error('İndirim tutarı negatif olamaz.');
  }

  const subtotal = toMoney(
    lines.reduce((sum, line) => {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new Error('Satış kalemi miktarı sıfırdan büyük tam sayı olmalıdır.');
      }

      if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        throw new Error('Satış kalemi birim fiyatı negatif olamaz.');
      }

      return sum + line.quantity * line.unitPrice;
    }, 0),
  );

  const normalizedDiscount = toMoney(discountTotal);

  if (normalizedDiscount > subtotal) {
    throw new Error('İndirim tutarı ara toplamı aşamaz.');
  }

  return {
    subtotal,
    discountTotal: normalizedDiscount,
    total: toMoney(subtotal - normalizedDiscount),
  };
}
