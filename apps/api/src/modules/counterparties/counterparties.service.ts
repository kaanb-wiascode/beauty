import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AccountsPayableCreditAnalyticsService } from '../accounts-payable/accounts-payable-credit-analytics.service';
import { CustomerLedgerService } from '../customer-ledger/customer-ledger.service';

export type CounterpartyKind = 'CUSTOMER' | 'SUPPLIER';

type ListInput = {
  kind?: CounterpartyKind;
  search?: string;
};

@Injectable()
export class CounterpartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly customerLedger: CustomerLedgerService,
    private readonly supplierLedger: AccountsPayableCreditAnalyticsService,
  ) {}

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async list(input: ListInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const search = input.search?.trim() || null;

    const customers = input.kind === 'SUPPLIER'
      ? []
      : await this.prisma.$queryRawUnsafe<any[]>(
          `WITH sale_totals AS (
             SELECT s."customerId" AS customer_id,
                    COALESCE(SUM(s.total) FILTER (WHERE s.status='CONFIRMED'),0)::numeric AS total_sales
             FROM sales s
             WHERE s."tenantId"=$1::text
               AND ($3::text IS NULL OR s."branchId"=$3::text)
             GROUP BY s."customerId"
           ), payment_totals AS (
             SELECT s."customerId" AS customer_id,
                    COALESCE(SUM(sp.amount),0)::numeric AS gross_paid,
                    COALESCE(SUM(sp.amount) FILTER (WHERE sp.status='REFUNDED'),0)::numeric AS refunded
             FROM sale_payments sp
             JOIN sales s ON s.id=sp."saleId"
             WHERE sp."tenantId"=$1::text
               AND ($3::text IS NULL OR sp."branchId"=$3::text)
             GROUP BY s."customerId"
           )
           SELECT cp.id,
                  cp.source_id AS "sourceId",
                  'CUSTOMER'::text AS kind,
                  cp.display_name AS name,
                  cp.phone,
                  cp.email,
                  cp.tax_number AS "taxNumber",
                  GREATEST(
                    COALESCE(st.total_sales,0)
                    - (COALESCE(pt.gross_paid,0)-COALESCE(pt.refunded,0)),
                    0
                  )::numeric AS balance
           FROM counterparties cp
           JOIN customers c ON c.id=cp.source_id
           LEFT JOIN sale_totals st ON st.customer_id=c.id
           LEFT JOIN payment_totals pt ON pt.customer_id=c.id
           WHERE cp.tenant_id=$1::text
             AND cp.company_id=$2::text
             AND cp.kind='CUSTOMER'
             AND cp.status='ACTIVE'
             AND ($3::text IS NULL OR c."branchId"=$3::text)
             AND (
               $4::text IS NULL
               OR cp.display_name ILIKE '%' || $4 || '%'
               OR COALESCE(cp.phone,'') ILIKE '%' || $4 || '%'
               OR COALESCE(cp.email,'') ILIKE '%' || $4 || '%'
             )`,
          tenantId,
          companyId,
          branchId,
          search,
        );

    const suppliers = input.kind === 'CUSTOMER'
      ? []
      : await this.prisma.$queryRawUnsafe<any[]>(
          `WITH payment_totals AS (
             SELECT supplier_bill_id,SUM(amount)::numeric AS paid
             FROM supplier_bill_payments
             GROUP BY supplier_bill_id
           ), supplier_balances AS (
             SELECT b.supplier_id,
                    COALESCE(SUM(GREATEST(b.amount-COALESCE(p.paid,0),0))
                      FILTER (WHERE b.status<>'CANCELLED'),0)::numeric AS balance
             FROM supplier_bills b
             LEFT JOIN payment_totals p ON p.supplier_bill_id=b.id
             WHERE b.company_id=$1::text
               AND ($2::text IS NULL OR b.branch_id=$2::text)
             GROUP BY b.supplier_id
           )
           SELECT cp.id,
                  cp.source_id AS "sourceId",
                  'SUPPLIER'::text AS kind,
                  cp.display_name AS name,
                  cp.phone,
                  cp.email,
                  cp.tax_number AS "taxNumber",
                  COALESCE(sb.balance,0)::numeric AS balance
           FROM counterparties cp
           LEFT JOIN supplier_balances sb ON sb.supplier_id=cp.source_id
           WHERE cp.company_id=$1::text
             AND cp.kind='SUPPLIER'
             AND cp.status='ACTIVE'
             AND (
               $3::text IS NULL
               OR cp.display_name ILIKE '%' || $3 || '%'
               OR COALESCE(cp.phone,'') ILIKE '%' || $3 || '%'
               OR COALESCE(cp.email,'') ILIKE '%' || $3 || '%'
               OR COALESCE(cp.tax_number,'') ILIKE '%' || $3 || '%'
             )`,
          companyId,
          branchId,
          search,
        );

    return [...customers, ...suppliers]
      .map((item) => {
        const balance = this.round(Number(item.balance ?? 0));
        return {
          id: item.id,
          sourceId: item.sourceId,
          kind: item.kind as CounterpartyKind,
          name: item.name,
          phone: item.phone ?? null,
          email: item.email ?? null,
          taxNumber: item.taxNumber ?? null,
          balance,
          balanceStatus: balance > 0 ? 'OPEN' : 'SETTLED',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async detail(kind: CounterpartyKind, id: string) {
    const { companyId } = {
      companyId: this.tenantContext.getCompanyId(),
    };
    const rows = await this.prisma.$queryRawUnsafe<Array<{ sourceId: string }>>(
      `SELECT source_id AS "sourceId"
       FROM counterparties
       WHERE id=$1::text
         AND company_id=$2::text
         AND kind=$3::text
         AND status='ACTIVE'
       LIMIT 1`,
      id,
      companyId,
      kind,
    );
    const sourceId = rows[0]?.sourceId;
    if (!sourceId) {
      throw new NotFoundException('Cari hesap bulunamadı.');
    }

    if (kind === 'CUSTOMER') {
      return {
        kind,
        ...(await this.customerLedger.getCustomerLedger(sourceId)),
      };
    }
    if (kind === 'SUPPLIER') {
      return {
        kind,
        ...(await this.supplierLedger.supplierLedger(sourceId)),
      };
    }
    throw new NotFoundException('Cari hesap bulunamadı.');
  }
}
