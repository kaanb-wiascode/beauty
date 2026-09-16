import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface NetProfitabilityFilter {
  from?: Date;
  to?: Date;
}

@Injectable()
export class NetProfitabilityService {
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

  private params(filter: NetProfitabilityFilter) {
    const { companyId, branchId } = this.context();
    return [companyId, branchId, filter.from ?? null, filter.to ?? null] as const;
  }

  private normalize(rows: any[]) {
    return rows.map((row) => {
      const netRevenue = this.round(Number(row.netRevenue ?? 0));
      const materialCost = this.round(Number(row.materialCost ?? 0));
      const commissionCost = this.round(Number(row.commissionCost ?? 0));
      const contributionProfit = this.round(netRevenue - materialCost - commissionCost);
      return {
        ...row,
        saleCount: Number(row.saleCount ?? 0),
        netRevenue,
        materialCost,
        commissionCost,
        contributionProfit,
        contributionMarginPercent:
          netRevenue > 0 ? this.round((contributionProfit / netRevenue) * 100) : 0,
      };
    });
  }

  private baseCte() {
    return `WITH refunds AS (
      SELECT sp."saleId",COALESCE(SUM(sp.amount),0)::numeric AS refunded
      FROM sale_payments sp
      WHERE sp.status='REFUNDED'
      GROUP BY sp."saleId"
    ), item_net AS (
      SELECT si.id AS sale_item_id,si."saleId" AS sale_id,si."serviceId" AS service_id,
             s."branchId" AS branch_id,s."customerId" AS customer_id,s."confirmedAt" AS confirmed_at,
             CASE WHEN s.subtotal > 0
               THEN ROUND((si."lineTotal" / s.subtotal) * GREATEST(s.total-COALESCE(r.refunded,0),0),2)
               ELSE 0 END::numeric AS net_revenue
      FROM sale_items si
      JOIN sales s ON s.id=si."saleId"
      JOIN branches b ON b.id=s."branchId"
      LEFT JOIN refunds r ON r."saleId"=s.id
      WHERE s.status='CONFIRMED'
        AND b."companyId"=$1::text
        AND ($2::text IS NULL OR s."branchId"=$2::text)
        AND ($3::timestamptz IS NULL OR s."confirmedAt">=$3::timestamptz)
        AND ($4::timestamptz IS NULL OR s."confirmedAt"<=$4::timestamptz)
    ), appointment_costs AS (
      SELECT im.reference_id AS appointment_id,
             COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS material_cost
      FROM inventory_movements im
      JOIN journal_entries je ON je."companyId"=im.company_id
        AND je."referenceType"='INVENTORY_CONSUMPTION'
        AND je."referenceId"=im.id
        AND je.status='POSTED'
      JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
      JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='740'
      WHERE im.reference_type='APPOINTMENT' AND im.type='SERVICE_CONSUMPTION'
      GROUP BY im.reference_id
    ), attributed AS (
      SELECT i.*,a.appointment_id,a.staff_id,a.commission_rate_snapshot,
             COALESCE(ac.material_cost,0)::numeric AS material_cost,
             ROUND(i.net_revenue*a.commission_rate_snapshot/100,2)::numeric AS commission_cost
      FROM item_net i
      JOIN sale_item_attributions a ON a.sale_item_id=i.sale_item_id
      LEFT JOIN appointment_costs ac ON ac.appointment_id=a.appointment_id
    )`;
  }

  async summary(filter: NetProfitabilityFilter) {
    const params = this.params(filter);
    const sales = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}
       SELECT COUNT(DISTINCT sale_id)::int AS "saleCount",
              COALESCE(SUM(net_revenue),0)::numeric AS "netRevenue"
       FROM item_net`,
      ...params,
    );
    const attributed = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}
       SELECT COALESCE(SUM(material_cost),0)::numeric AS "materialCost",
              COALESCE(SUM(commission_cost),0)::numeric AS "commissionCost"
       FROM attributed`,
      ...params,
    );
    const expenses = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS expenses
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
       JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE' AND coa.code<>'740'
       WHERE je."companyId"=$1::text
         AND ($2::text IS NULL OR je."branchId"=$2::text OR je."branchId" IS NULL)
         AND ($3::timestamptz IS NULL OR je."entryDate">=$3::timestamptz)
         AND ($4::timestamptz IS NULL OR je."entryDate"<=$4::timestamptz)`,
      ...params,
    );

    const netRevenue = this.round(Number(sales[0]?.netRevenue ?? 0));
    const materialCost = this.round(Number(attributed[0]?.materialCost ?? 0));
    const commissionCost = this.round(Number(attributed[0]?.commissionCost ?? 0));
    const generalExpenses = this.round(Number(expenses[0]?.expenses ?? 0));
    const contributionProfit = this.round(netRevenue - materialCost - commissionCost);
    const operatingProfit = this.round(contributionProfit - generalExpenses);

    return {
      basis: 'CONFIRMED_SALES_NET_OF_DISCOUNTS_AND_REFUNDED_PAYMENTS',
      saleCount: Number(sales[0]?.saleCount ?? 0),
      netRevenue,
      materialCost,
      commissionCost,
      generalExpenses,
      contributionProfit,
      operatingProfit,
      operatingMarginPercent: netRevenue > 0 ? this.round((operatingProfit / netRevenue) * 100) : 0,
    };
  }

  async byBranch(filter: NetProfitabilityFilter) {
    const params = this.params(filter);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}, branch_revenue AS (
         SELECT branch_id,COUNT(DISTINCT sale_id)::int AS sale_count,SUM(net_revenue)::numeric AS net_revenue
         FROM item_net GROUP BY branch_id
       ), branch_cost AS (
         SELECT branch_id,SUM(material_cost)::numeric AS material_cost,SUM(commission_cost)::numeric AS commission_cost
         FROM attributed GROUP BY branch_id
       )
       SELECT b.id AS "branchId",b.name AS "branchName",br.sale_count AS "saleCount",
              br.net_revenue AS "netRevenue",COALESCE(bc.material_cost,0)::numeric AS "materialCost",
              COALESCE(bc.commission_cost,0)::numeric AS "commissionCost"
       FROM branch_revenue br
       JOIN branches b ON b.id=br.branch_id
       LEFT JOIN branch_cost bc ON bc.branch_id=br.branch_id
       ORDER BY br.net_revenue DESC`,
      ...params,
    );

    const expenseRows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH direct_expense AS (
         SELECT je."branchId" AS branch_id,
                COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE' AND coa.code<>'740'
         WHERE je."companyId"=$1::text
           AND je."branchId" IS NOT NULL
           AND ($2::text IS NULL OR je."branchId"=$2::text)
           AND ($3::timestamptz IS NULL OR je."entryDate">=$3::timestamptz)
           AND ($4::timestamptz IS NULL OR je."entryDate"<=$4::timestamptz)
         GROUP BY je."branchId"
       ), allocated_expense AS (
         SELECT cba.branch_id,
                COALESCE(SUM((jel.debit-jel.credit)*(cba.percent/100.0)),0)::numeric AS amount
         FROM cost_center_expense_links ccel
         JOIN cost_centers cc ON cc.id=ccel.cost_center_id AND cc.active=true
         JOIN cost_center_branch_allocations cba ON cba.cost_center_id=cc.id
         JOIN journal_entry_lines jel ON jel.id=ccel.journal_entry_line_id
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED' AND je."branchId" IS NULL
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.type='EXPENSE' AND coa.code<>'740'
         WHERE cc.company_id=$1::text
           AND ($2::text IS NULL OR cba.branch_id=$2::text)
           AND ($3::timestamptz IS NULL OR je."entryDate">=$3::timestamptz)
           AND ($4::timestamptz IS NULL OR je."entryDate"<=$4::timestamptz)
         GROUP BY cba.branch_id
       )
       SELECT b.id AS "branchId",
              COALESCE(d.amount,0)::numeric AS "directExpenses",
              COALESCE(a.amount,0)::numeric AS "allocatedExpenses"
       FROM branches b
       LEFT JOIN direct_expense d ON d.branch_id=b.id
       LEFT JOIN allocated_expense a ON a.branch_id=b.id
       WHERE b."companyId"=$1::text
         AND ($2::text IS NULL OR b.id=$2::text)`,
      ...params,
    );

    const expensesByBranch = new Map(
      expenseRows.map((row) => [row.branchId, {
        directExpenses: this.round(Number(row.directExpenses ?? 0)),
        allocatedExpenses: this.round(Number(row.allocatedExpenses ?? 0)),
      }]),
    );

    return this.normalize(rows).map((row) => {
      const expenses = expensesByBranch.get(row.branchId) ?? { directExpenses: 0, allocatedExpenses: 0 };
      const generalExpenses = this.round(expenses.directExpenses + expenses.allocatedExpenses);
      const operatingProfit = this.round(row.contributionProfit - generalExpenses);
      return {
        ...row,
        directExpenses: expenses.directExpenses,
        allocatedExpenses: expenses.allocatedExpenses,
        generalExpenses,
        operatingProfit,
        operatingMarginPercent: row.netRevenue > 0 ? this.round((operatingProfit / row.netRevenue) * 100) : 0,
      };
    });
  }

  async byService(filter: NetProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}
       SELECT sv.id AS "serviceId",sv.name AS "serviceName",COUNT(DISTINCT a.sale_id)::int AS "saleCount",
              COALESCE(SUM(a.net_revenue),0)::numeric AS "netRevenue",
              COALESCE(SUM(a.material_cost),0)::numeric AS "materialCost",
              COALESCE(SUM(a.commission_cost),0)::numeric AS "commissionCost"
       FROM attributed a
       JOIN services sv ON sv.id=a.service_id
       GROUP BY sv.id,sv.name
       ORDER BY "netRevenue" DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }

  async byStaff(filter: NetProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}
       SELECT st.id AS "staffId",CONCAT_WS(' ',st."firstName",st."lastName") AS "staffName",
              COUNT(DISTINCT a.sale_id)::int AS "saleCount",
              COALESCE(SUM(a.net_revenue),0)::numeric AS "netRevenue",
              COALESCE(SUM(a.material_cost),0)::numeric AS "materialCost",
              COALESCE(SUM(a.commission_cost),0)::numeric AS "commissionCost"
       FROM attributed a
       JOIN staff st ON st.id=a.staff_id
       GROUP BY st.id,st."firstName",st."lastName"
       ORDER BY "netRevenue" DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }

  async byCustomer(filter: NetProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `${this.baseCte()}, customer_revenue AS (
         SELECT customer_id,COUNT(DISTINCT sale_id)::int AS sale_count,SUM(net_revenue)::numeric AS net_revenue
         FROM item_net GROUP BY customer_id
       ), customer_cost AS (
         SELECT customer_id,SUM(material_cost)::numeric AS material_cost,SUM(commission_cost)::numeric AS commission_cost
         FROM attributed GROUP BY customer_id
       )
       SELECT c.id AS "customerId",CONCAT_WS(' ',c."firstName",c."lastName") AS "customerName",
              cr.sale_count AS "saleCount",cr.net_revenue AS "netRevenue",
              COALESCE(cc.material_cost,0)::numeric AS "materialCost",
              COALESCE(cc.commission_cost,0)::numeric AS "commissionCost"
       FROM customer_revenue cr
       JOIN customers c ON c.id=cr.customer_id
       LEFT JOIN customer_cost cc ON cc.customer_id=cr.customer_id
       ORDER BY cr.net_revenue DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }
}
