export type IncomeCollectionStatus = 'UNCOLLECTED' | 'PARTIALLY_COLLECTED' | 'COLLECTED' | 'CANCELLED';

const MONEY_TOLERANCE = 0.01;

export function assertCollectionAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Collection amount must be greater than zero.');
  }
}

export function assertCollectionDoesNotExceedGross(grossAmount: number, collectedAmount: number, nextAmount: number) {
  assertCollectionAmount(nextAmount);
  if (![grossAmount, collectedAmount].every(Number.isFinite) || grossAmount < 0 || collectedAmount < 0) {
    throw new Error('Collection totals must be finite and non-negative.');
  }
  if (collectedAmount + nextAmount - grossAmount > MONEY_TOLERANCE) {
    throw new Error('Collection would exceed the income gross amount.');
  }
}

export function deriveIncomeCollectionStatus(grossAmount: number, collectedAmount: number): IncomeCollectionStatus {
  if (![grossAmount, collectedAmount].every(Number.isFinite) || grossAmount < 0 || collectedAmount < 0) {
    throw new Error('Collection totals must be finite and non-negative.');
  }
  if (collectedAmount <= MONEY_TOLERANCE) return 'UNCOLLECTED';
  if (Math.abs(collectedAmount - grossAmount) <= MONEY_TOLERANCE) return 'COLLECTED';
  if (collectedAmount < grossAmount) return 'PARTIALLY_COLLECTED';
  throw new Error('Collected amount cannot exceed income gross amount.');
}

export function buildCollectionReversalLines(receivableAccountId: string, collectionAccountId: string, amount: number) {
  assertCollectionAmount(amount);
  if (!receivableAccountId || !collectionAccountId) {
    throw new Error('Receivable and collection accounts are required for reversal.');
  }
  return [
    { accountId: receivableAccountId, debit: amount, credit: 0, memo: 'Tahsilat ters kaydı - alacağı yeniden aç' },
    { accountId: collectionAccountId, debit: 0, credit: amount, memo: 'Tahsilat ters kaydı - varlık hesabını azalt' },
  ];
}
