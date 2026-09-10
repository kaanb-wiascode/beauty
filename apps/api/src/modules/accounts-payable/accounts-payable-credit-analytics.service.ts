import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class AccountsPayableCreditAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async summary() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH payment_totals AS (
         SELECT supplier_bill_id,SUM(amount)::numeric AS paid
         FROM supplier_bill_payments GROUP BY supplier_bill_id
       ), credit_totals AS (
         SELECT supplier_bill_id,SUM(amount)::numeric AS credits
         FROM supplier_credit_notes GROUP BY supplier_bill_id
       )
       SELECT COUNT(*) FILTER (WHERE b.status<>'CANCELLED')::int AS "billCount",
              COALESCE(SUM(b.amount+COALESCE(c.credits,0)) FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS "grossBills",
              COALESCE(SUM(COALESCE(c.credits,0)) FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS "creditNotes",
              COALESCE(SUM(b.amount) FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS "netBills",
              COALESCE(SUM(COALESCE(p.paid,0)) FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS paid,
              COALESCE(SUM(GREATEST(b.amount-COALESCE(p.paid,0),0)) FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS outstanding,
              COUNT(*) FILTER (WHERE b.due_at<NOW() AND b.status IN ('OPEN','PARTIALLY_PAID') AND b.amount-COALESCE(p.paid,0)>0)::int AS "overdueCount"
       FROM supplier_bills b
       LEFT JOIN payment_totals p ON p.supplier_bill_id=b.id
       LEFT JOIN credit_totals c ON c.supplier_bill_id=b.id
       WHERE b.company_id=$1::text AND ($2::text IS NULL OR b.branch_id=$2::text)`,
      companyId,
      branchId,
    );
    const row = rows[0] ?? {};
    return {
      billCount: Number(row.billCount ?? 0),
      grossBills: this.round(Number(row.grossBills ?? 0)),
      creditNotes: this.round(Number(row.creditNotes ?? 0)),
      netBills: this.round(Number(row.netBills ?? 0)),
      paid: this.round(Number(row.paid ?? 0)),
      outstanding: this.round(Number(row.outstanding ?? 0)),
      overdueCount: Number(row.overdueCount ?? 0),
    };
  }

  async aging() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH payments AS (
         SELECT supplier_bill_id,SUM(amount)::numeric AS paid FROM supplier_bill_payments GROUP BY supplier_bill_id
       ), balances AS (
         SELECT b.id,b.due_at,GREATEST(b.amount-COALESCE(p.paid,0),0)::numeric AS balance
         FROM supplier_bills b
         LEFT JOIN payments p ON p.supplier_bill_id=b.id
         WHERE b.company_id=$1::text
           AND ($2::text IS NULL OR b.branch_id=$2::text)
           AND b.status IN ('OPEN','PARTIALLY_PAID')
       )
       SELECT COALESCE(SUM(balance) FILTER (WHERE due_at IS NULL OR due_at >= CURRENT_DATE),0)::numeric AS "notDue",
              COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE AND due_at >= CURRENT_DATE-INTERVAL '30 days'),0)::numeric AS "days0to30",
              COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '30 days' AND due_at >= CURRENT_DATE-INTERVAL '60 days'),0)::numeric AS "days31to60",
              COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '60 days' AND due_at >= CURRENT_DATE-INTERVAL '90 days'),0)::numeric AS "days61to90",
              COALESCE(SUM(balance) FILTER (WHERE due_at < CURRENT_DATE-INTERVAL '90 days'),0)::numeric AS "days90Plus",
              COALESCE(SUM(balance),0)::numeric AS total
       FROM balances`,
      companyId,
      branchId,
    );
    const row = rows[0] ?? {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, this.round(Number(value ?? 0))]));
  }

  async supplierLedger(supplierId: string) {
    const { companyId, branchId } = this.context();
    const suppliers = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name FROM inventory_suppliers WHERE id=$1::text AND company_id=$2::text LIMIT 1`,
      supplierId,
      companyId,
    );
    if (!suppliers.length) throw new NotFoundException('Supplier not found');

    const entries = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM (
         SELECT b.id AS "referenceId",'BILL'::text AS type,b.created_at AS date,
                COALESCE(b.invoice_number,b.id) AS reference,b.description,
                (b.amount+COALESCE((SELECT SUM(c.amount) FROM supplier_credit_notes c WHERE c.supplier_bill_id=b.id),0))::numeric AS debit,
                0::numeric AS credit
         FROM supplier_bills b
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)

         UNION ALL

         SELECT c.id AS "referenceId",'CREDIT_NOTE'::text AS type,c.created_at AS date,
                c.id AS reference,c.reason AS description,0::numeric AS debit,c.amount::numeric AS credit
         FROM supplier_credit_notes c
         WHERE c.supplier_id=$1::text AND c.company_id=$2::text
           AND ($3::text IS NULL OR c.branch_id=$3::text)

         UNION ALL

         SELECT p.id AS "referenceId",'PAYMENT'::text AS type,p.paid_at AS date,
                COALESCE(p.reference,p.id) AS reference,COALESCE(p.note,'Tedarikçi ödemesi') AS description,
                0::numeric AS debit,p.amount::numeric AS credit
         FROM supplier_bill_payments p
         JOIN supplier_bills b ON b.id=p.supplier_bill_id
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)

         UNION ALL

         SELECT b.id AS "referenceId",'BILL_CANCELLATION'::text AS type,b.cancelled_at AS date,
                COALESCE(b.invoice_number,b.id) AS reference,COALESCE(b.cancel_reason,'Fatura iptali') AS description,
                0::numeric AS debit,b.amount::numeric AS credit
         FROM supplier_bills b
         WHERE b.supplier_id=$1::text AND b.company_id=$2::text
           AND ($3::text IS NULL OR b.branch_id=$3::text)
           AND b.status='CANCELLED' AND b.cancelled_at IS NOT NULL
       ) x
       ORDER BY date ASC,type ASC,"referenceId" ASC`,
      supplierId,
      companyId,
      branchId,
    );

    let runningBalance = 0;
    const ledger = entries.map((entry) => {
      const debit = Number(entry.debit ?? 0);
      const credit = Number(entry.credit ?? 0);
      runningBalance = this.round(runningBalance + debit - credit);
      return { ...entry, debit, credit, runningBalance };
    });

    return {
      supplier: suppliers[0],
      totals: {
        debit: this.round(ledger.reduce((sum, entry) => sum + entry.debit, 0)),
        credit: this.round(ledger.reduce((sum, entry) => sum + entry.credit, 0)),
        balance: runningBalance,
      },
      entries: ledger,
    };
  }
}
