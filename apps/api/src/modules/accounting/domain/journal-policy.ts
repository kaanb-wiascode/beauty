export interface JournalLineInput {
  debit: number;
  credit: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateJournalLines(lines: JournalLineInput[]) {
  if (lines.length < 2) {
    throw new Error('A journal entry must contain at least two lines.');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit)) {
      throw new Error('Journal amounts must be finite numbers.');
    }
    if (line.debit < 0 || line.credit < 0) {
      throw new Error('Journal amounts cannot be negative.');
    }
    if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
      throw new Error('Each journal line must contain either a debit or a credit amount.');
    }

    totalDebit = roundMoney(totalDebit + line.debit);
    totalCredit = roundMoney(totalCredit + line.credit);
  }

  if (totalDebit !== totalCredit) {
    throw new Error(`Journal entry is not balanced: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}.`);
  }

  return { totalDebit, totalCredit };
}
