export type InstallmentRuntimeStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export interface PlannedInstallment {
  sequence: number;
  amount: number;
  dueAt: Date;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addMonths(base: Date, months: number): Date {
  const result = new Date(base);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function createInstallmentSchedule(
  total: number,
  installmentCount: number,
  firstDueAt: Date,
  intervalMonths = 1,
): PlannedInstallment[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error('Installment total must be greater than zero.');
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) throw new Error('Installment count must be a positive integer.');
  if (!(firstDueAt instanceof Date) || Number.isNaN(firstDueAt.getTime())) throw new Error('First due date is invalid.');
  if (!Number.isInteger(intervalMonths) || intervalMonths <= 0) throw new Error('Installment interval must be a positive integer.');

  const roundedTotal = roundMoney(total);
  const regularAmount = Math.floor((roundedTotal * 100) / installmentCount) / 100;
  let allocated = 0;

  return Array.from({ length: installmentCount }, (_, index) => {
    const isLast = index === installmentCount - 1;
    const amount = isLast ? roundMoney(roundedTotal - allocated) : regularAmount;
    allocated = roundMoney(allocated + amount);

    return {
      sequence: index + 1,
      amount,
      dueAt: addMonths(firstDueAt, index * intervalMonths),
    };
  });
}

export function getInstallmentRuntimeStatus(
  amount: number,
  paidAmount: number,
  dueAt: Date,
  now = new Date(),
): InstallmentRuntimeStatus {
  const remaining = roundMoney(amount - paidAmount);
  if (remaining <= 0) return 'PAID';
  if (paidAmount > 0) return dueAt.getTime() < now.getTime() ? 'OVERDUE' : 'PARTIALLY_PAID';
  return dueAt.getTime() < now.getTime() ? 'OVERDUE' : 'PENDING';
}
