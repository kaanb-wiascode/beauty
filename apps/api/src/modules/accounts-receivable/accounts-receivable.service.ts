import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type ReceivableStatus = 'OPEN' | 'PARTIALLY_PAID' | 'OVERDUE';

@Injectable()
export class AccountsReceivableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async openReceivables() {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH completed_payments AS (
         SELECT "saleId" AS sale_id,
                COALESCE(SUM(amount) FILTER (WHERE status='COMPLETED'),0)::numeric AS paid
         FROM sale_payments
         WHERE "tenantId"=$1::text
           AND ($3::text IS NULL OR "branchId"=$3::text)
         GROUP BY "saleId"
       ), installment_due AS (
         SELECT ip."saleId" AS sale_id,
                MIN(i."dueAt") FILTER (
                  WHERE GREATEST(i.amount-COALESCE(a.paid,0),0)>0
                ) AS next_due_at,
                COALESCE(SUM(
                  GREATEST(i.amount-COALESCE(a.paid,0),0)
                ) FILTER (WHERE i."dueAt"<CURRENT_DATE),0)::numeric AS overdue_amount
         FROM installment_plans ip
         JOIN installments i ON i."installmentPlanId"=ip.id
         LEFT JOIN (
           SELECT ia."installmentId" AS installment_id,
                  COALESCE(SUM(ia.amount) FILTER (WHERE sp.status='COMPLETED'),0)::numeric AS paid
           FROM installment_allocations ia
           JOIN sale_payments sp ON sp.id=ia."salePaymentId"
           GROUP BY ia."installmentId"
         ) a ON a.installment_id=i.id
         GROUP BY ip."saleId"
       )
       SELECT s.id AS "saleId",
              s."counterpartyId" AS "counterpartyId",
              cp.display_name AS "customerName",
              cp.phone,
              cp.email,
              s.total::numeric AS total,
              COALESCE(p.paid,0)::numeric AS paid,
              GREATEST(s.total-COALESCE(p.paid,0),0)::numeric AS balance,
              COALESCE(
                d.next_due_at,
                (s."confirmedAt")::date
              ) AS "nextDueAt",
              CASE
                WHEN d.sale_id IS NOT NULL THEN d.overdue_amount
                WHEN s."confirmedAt"::date<CURRENT_DATE
                  THEN GREATEST(s.total-COALESCE(p.paid,0),0)
                ELSE 0
              END::numeric AS "overdueAmount",
              s."confirmedAt" AS "confirmedAt"
       FROM sales s
       JOIN counterparties cp ON cp.id=s."counterpartyId"
       JOIN branches b ON b.id=s."branchId"
       LEFT JOIN completed_payments p ON p.sale_id=s.id
       LEFT JOIN installment_due d ON d.sale_id=s.id
       WHERE s."tenantId"=$1::text
         AND b."companyId"=$2::text
         AND s.status='CONFIRMED'
         AND ($3::text IS NULL OR s."branchId"=$3::text)
         AND GREATEST(s.total-COALESCE(p.paid,0),0)>0
       ORDER BY
         CASE WHEN
           CASE
             WHEN d.sale_id IS NOT NULL THEN d.overdue_amount
             WHEN s."confirmedAt"::date<CURRENT_DATE
               THEN GREATEST(s.total-COALESCE(p.paid,0),0)
             ELSE 0
           END > 0
         THEN 0 ELSE 1 END,
         COALESCE(d.next_due_at,(s."confirmedAt")::date) ASC,
         s."confirmedAt" ASC`,
      tenantId,
      companyId,
      branchId,
    );

    return rows.map((row) => {
      const total = this.round(Number(row.total ?? 0));
      const paid = this.round(Number(row.paid ?? 0));
      const balance = this.round(Number(row.balance ?? 0));
      const overdueAmount = this.round(Number(row.overdueAmount ?? 0));
      const status: ReceivableStatus =
        overdueAmount > 0 ? 'OVERDUE' : paid > 0 ? 'PARTIALLY_PAID' : 'OPEN';

      return {
        saleId: row.saleId,
        counterpartyId: row.counterpartyId,
        customerName: row.customerName,
        phone: row.phone ?? null,
        email: row.email ?? null,
        total,
        paid,
        balance,
        nextDueAt: row.nextDueAt ?? null,
        overdueAmount,
        confirmedAt: row.confirmedAt,
        status,
      };
    });
  }

  async summary() {
    const rows = await this.openReceivables();
    const customerIds = new Set(rows.map((row) => row.counterpartyId));
    return {
      receivableCount: rows.length,
      customerCount: customerIds.size,
      totalOpen: this.round(rows.reduce((sum, row) => sum + row.balance, 0)),
      totalOverdue: this.round(
        rows.reduce((sum, row) => sum + row.overdueAmount, 0),
      ),
      partiallyPaidCount: rows.filter((row) => row.status === 'PARTIALLY_PAID')
        .length,
      overdueCount: rows.filter((row) => row.status === 'OVERDUE').length,
    };
  }

  async aging() {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH installment_paid AS (
         SELECT ia."installmentId" AS installment_id,
                COALESCE(SUM(ia.amount) FILTER (WHERE sp.status='COMPLETED'),0)::numeric AS paid
         FROM installment_allocations ia
         JOIN sale_payments sp ON sp.id=ia."salePaymentId"
         GROUP BY ia."installmentId"
       ), installment_open AS (
         SELECT i.id,
                GREATEST(i.amount-COALESCE(ipaid.paid,0),0)::numeric AS balance,
                i."dueAt" AS due_at
         FROM installments i
         JOIN installment_plans ip ON ip.id=i."installmentPlanId"
         JOIN sales s ON s.id=ip."saleId"
         JOIN branches b ON b.id=s."branchId"
         LEFT JOIN installment_paid ipaid ON ipaid.installment_id=i.id
         WHERE s."tenantId"=$1::text
           AND b."companyId"=$2::text
           AND s.status='CONFIRMED'
           AND ($3::text IS NULL OR s."branchId"=$3::text)
           AND GREATEST(i.amount-COALESCE(ipaid.paid,0),0)>0
       ), completed_payments AS (
         SELECT "saleId" AS sale_id,
                COALESCE(SUM(amount) FILTER (WHERE status='COMPLETED'),0)::numeric AS paid
         FROM sale_payments
         WHERE "tenantId"=$1::text
           AND ($3::text IS NULL OR "branchId"=$3::text)
         GROUP BY "saleId"
       ), non_installment_open AS (
         SELECT s.id,
                GREATEST(s.total-COALESCE(p.paid,0),0)::numeric AS balance,
                s."confirmedAt" AS due_at
         FROM sales s
         JOIN branches b ON b.id=s."branchId"
         LEFT JOIN completed_payments p ON p.sale_id=s.id
         LEFT JOIN installment_plans ip ON ip."saleId"=s.id
         WHERE s."tenantId"=$1::text
           AND b."companyId"=$2::text
           AND s.status='CONFIRMED'
           AND ip.id IS NULL
           AND ($3::text IS NULL OR s."branchId"=$3::text)
           AND GREATEST(s.total-COALESCE(p.paid,0),0)>0
       ), open_items AS (
         SELECT balance,due_at FROM installment_open
         UNION ALL
         SELECT balance,due_at FROM non_installment_open
       )
       SELECT
         COALESCE(SUM(balance) FILTER (WHERE due_at::date>=CURRENT_DATE),0)::numeric AS "notDue",
         COALESCE(SUM(balance) FILTER (
           WHERE due_at::date<CURRENT_DATE
             AND due_at::date>=CURRENT_DATE-INTERVAL '30 days'
         ),0)::numeric AS "days0to30",
         COALESCE(SUM(balance) FILTER (
           WHERE due_at::date<CURRENT_DATE-INTERVAL '30 days'
             AND due_at::date>=CURRENT_DATE-INTERVAL '60 days'
         ),0)::numeric AS "days31to60",
         COALESCE(SUM(balance) FILTER (
           WHERE due_at::date<CURRENT_DATE-INTERVAL '60 days'
             AND due_at::date>=CURRENT_DATE-INTERVAL '90 days'
         ),0)::numeric AS "days61to90",
         COALESCE(SUM(balance) FILTER (
           WHERE due_at::date<CURRENT_DATE-INTERVAL '90 days'
         ),0)::numeric AS "days90Plus",
         COALESCE(SUM(balance),0)::numeric AS total
       FROM open_items`,
      tenantId,
      companyId,
      branchId,
    );

    const row = rows[0] ?? {};
    return {
      notDue: this.round(Number(row.notDue ?? 0)),
      days0to30: this.round(Number(row.days0to30 ?? 0)),
      days31to60: this.round(Number(row.days31to60 ?? 0)),
      days61to90: this.round(Number(row.days61to90 ?? 0)),
      days90Plus: this.round(Number(row.days90Plus ?? 0)),
      total: this.round(Number(row.total ?? 0)),
    };
  }
}
