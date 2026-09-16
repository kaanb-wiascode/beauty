import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type FinanceReportingInput = Readonly<{
  from: Date;
  to: Date;
}>;

type IncomeRow = {
  transactionDate: Date;
  grossAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  collectedAmount: Prisma.Decimal;
};

type ExpenseRow = {
  transactionDate: Date;
  grossAmount: Prisma.Decimal;
  withholdingAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
};

@Injectable()
export class FinanceReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async performance(input: FinanceReportingInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    const [incomeRows, expenseRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<IncomeRow[]>(
        `SELECT i.transaction_date AS "transactionDate",i.gross_amount AS "grossAmount",i.exchange_rate AS "exchangeRate",
                COALESCE((
                  SELECT SUM(c.amount)
                  FROM income_collections c
                  LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
                  WHERE c.income_record_id=i.id AND c.tenant_id=i.tenant_id AND c.company_id=i.company_id AND r.id IS NULL
                ),0) AS "collectedAmount"
         FROM income_records i
         WHERE i.tenant_id=$1::text AND i.company_id=$2::text
           AND ($3::text IS NULL OR i.branch_id=$3::text)
           AND i.approval_status='APPROVED'
           AND i.transaction_date >= $4 AND i.transaction_date <= $5
         ORDER BY i.transaction_date ASC`,
        tenantId,
        companyId,
        branchId,
        input.from,
        input.to,
      ),
      this.prisma.$queryRawUnsafe<ExpenseRow[]>(
        `SELECT e.transaction_date AS "transactionDate",e.gross_amount AS "grossAmount",e.withholding_amount AS "withholdingAmount",
                e.exchange_rate AS "exchangeRate",
                COALESCE((
                  SELECT SUM(p.amount)
                  FROM expense_payments p
                  LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
                  WHERE p.expense_id=e.id AND p.tenant_id=e.tenant_id AND p.company_id=e.company_id AND r.id IS NULL
                ),0) AS "paidAmount"
         FROM expenses e
         WHERE e.tenant_id=$1::text AND e.company_id=$2::text
           AND ($3::text IS NULL OR e.branch_id=$3::text)
           AND e.approval_status='APPROVED'
           AND e.transaction_date >= $4 AND e.transaction_date <= $5
         ORDER BY e.transaction_date ASC`,
        tenantId,
        companyId,
        branchId,
        input.from,
        input.to,
      ),
    ]);

    const buckets = new Map<string, {
      date: string;
      incomeRecognized: number;
      expenseRecognized: number;
      payableAmount: number;
      collected: number;
      paid: number;
      receivableOutstanding: number;
      payableOutstanding: number;
      incomeRecordCount: number;
      expenseRecordCount: number;
    }>();

    const bucketFor = (date: Date) => {
      const key = date.toISOString().slice(0, 10);
      const existing = buckets.get(key);
      if (existing) return existing;
      const created = {
        date: key,
        incomeRecognized: 0,
        expenseRecognized: 0,
        payableAmount: 0,
        collected: 0,
        paid: 0,
        receivableOutstanding: 0,
        payableOutstanding: 0,
        incomeRecordCount: 0,
        expenseRecordCount: 0,
      };
      buckets.set(key, created);
      return created;
    };

    for (const row of incomeRows) {
      const bucket = bucketFor(row.transactionDate);
      const rate = Number(row.exchangeRate);
      const gross = Number(row.grossAmount) * rate;
      const collected = Number(row.collectedAmount) * rate;
      bucket.incomeRecognized += gross;
      bucket.collected += collected;
      bucket.receivableOutstanding += Math.max(0, gross - collected);
      bucket.incomeRecordCount += 1;
    }

    for (const row of expenseRows) {
      const bucket = bucketFor(row.transactionDate);
      const rate = Number(row.exchangeRate);
      const gross = Number(row.grossAmount) * rate;
      const withholding = Number(row.withholdingAmount) * rate;
      const payable = Math.max(0, gross - withholding);
      const paid = Number(row.paidAmount) * rate;
      bucket.expenseRecognized += gross;
      bucket.payableAmount += payable;
      bucket.paid += paid;
      bucket.payableOutstanding += Math.max(0, payable - paid);
      bucket.expenseRecordCount += 1;
    }

    return [...buckets.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((bucket) => ({
        ...bucket,
        operatingMargin: bucket.incomeRecognized - bucket.expenseRecognized,
        netCashMovement: bucket.collected - bucket.paid,
        collectionRate: bucket.incomeRecognized
          ? Math.round((bucket.collected / bucket.incomeRecognized) * 100)
          : 0,
        paymentRate: bucket.payableAmount
          ? Math.round((bucket.paid / bucket.payableAmount) * 100)
          : 0,
      }));
  }
}
