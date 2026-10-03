import type { Prisma } from '@beauty-erp/database';

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export async function ensureFxAccounts(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; companyId: string },
) {
  const [gain, loss] = await Promise.all([
    tx.chartOfAccount.upsert({
      where: { companyId_code: { companyId: input.companyId, code: '646' } },
      update: { active: true },
      create: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: '646',
        name: 'Kambiyo Kârları',
        type: 'REVENUE',
        active: true,
      },
      select: { id: true },
    }),
    tx.chartOfAccount.upsert({
      where: { companyId_code: { companyId: input.companyId, code: '656' } },
      update: { active: true },
      create: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: '656',
        name: 'Kambiyo Zararları',
        type: 'EXPENSE',
        active: true,
      },
      select: { id: true },
    }),
  ]);
  return { gainAccountId: gain.id, lossAccountId: loss.id };
}

export function buildIncomeSettlementLines(input: {
  amount: number;
  documentRate: number;
  settlementRate: number;
  collectionAccountId: string;
  receivableAccountId: string;
  gainAccountId: string;
  lossAccountId: string;
}) {
  const receivableBase = roundMoney(input.amount * input.documentRate);
  const cashBase = roundMoney(input.amount * input.settlementRate);
  const difference = roundMoney(cashBase - receivableBase);
  const lines = [
    { accountId: input.collectionAccountId, debit: cashBase, credit: 0, memo: 'Gelir tahsilatı' },
    { accountId: input.receivableAccountId, debit: 0, credit: receivableBase, memo: 'Gelir alacağı kapama' },
  ];
  if (difference > 0) {
    lines.push({ accountId: input.gainAccountId, debit: 0, credit: difference, memo: 'Kur farkı geliri' });
  } else if (difference < 0) {
    lines.push({ accountId: input.lossAccountId, debit: Math.abs(difference), credit: 0, memo: 'Kur farkı gideri' });
  }
  return { lines, receivableBase, cashBase, difference };
}

export function buildExpenseSettlementLines(input: {
  amount: number;
  documentRate: number;
  settlementRate: number;
  payableAccountId: string;
  paymentAccountId: string;
  gainAccountId: string;
  lossAccountId: string;
}) {
  const payableBase = roundMoney(input.amount * input.documentRate);
  const cashBase = roundMoney(input.amount * input.settlementRate);
  const difference = roundMoney(cashBase - payableBase);
  const lines = [
    { accountId: input.payableAccountId, debit: payableBase, credit: 0, memo: 'Gider borcu kapama' },
    { accountId: input.paymentAccountId, debit: 0, credit: cashBase, memo: 'Gider ödemesi' },
  ];
  if (difference > 0) {
    lines.push({ accountId: input.lossAccountId, debit: difference, credit: 0, memo: 'Kur farkı gideri' });
  } else if (difference < 0) {
    lines.push({ accountId: input.gainAccountId, debit: 0, credit: Math.abs(difference), memo: 'Kur farkı geliri' });
  }
  return { lines, payableBase, cashBase, difference };
}

export function reverseJournalLines(
  lines: Array<{ accountId: string; debit: number; credit: number; memo?: string }>,
  memoPrefix = 'Ters kayıt',
) {
  return lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
    memo: `${memoPrefix}: ${line.memo ?? ''}`.trim(),
  }));
}
