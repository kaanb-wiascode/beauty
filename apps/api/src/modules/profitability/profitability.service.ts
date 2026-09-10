import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface ProfitabilityFilter {
  from?: Date;
  to?: Date;
}

@Injectable()
export class ProfitabilityService {
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

  private normalize(rows: any[]) {
    return rows.map((row) => {
      const appointmentCount = Number(row.appointmentCount ?? 0);
      const revenue = this.round(Number(row.revenue ?? 0));
      const materialCost = this.round(Number(row.materialCost ?? 0));
      const grossProfit = this.round(revenue - materialCost);
      const grossMarginPercent = revenue > 0 ? this.round((grossProfit / revenue) * 100) : 0;
      return {
        ...row,
        appointmentCount,
        revenue,
        materialCost,
        grossProfit,
        grossMarginPercent,
      };
    });
  }

  private params(filter: ProfitabilityFilter) {
    const { companyId, branchId } = this.context();
    return [companyId, branchId, filter.from ?? null, filter.to ?? null] as const;
  }

  async byBranch(filter: ProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH appointment_costs AS (
         SELECT im.reference_id AS appointment_id,
                COALESCE(SUM(jel.debit),0)::numeric AS material_cost
         FROM inventory_movements im
         JOIN journal_entries je ON je."companyId"=im.company_id
           AND je."referenceType"='INVENTORY_CONSUMPTION'
           AND je."referenceId"=im.id
           AND je.status='POSTED'
         JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='740'
         WHERE im.reference_type='APPOINTMENT' AND im.type='SERVICE_CONSUMPTION'
         GROUP BY im.reference_id
       )
       SELECT b.id AS "branchId",b.name AS "branchName",
              COUNT(a.id)::int AS "appointmentCount",
              COALESCE(SUM(s.price),0)::numeric AS revenue,
              COALESCE(SUM(ac.material_cost),0)::numeric AS "materialCost"
       FROM appointments a
       JOIN branches b ON b.id=a.branch_id
       JOIN services s ON s.id=a.service_id
       LEFT JOIN appointment_costs ac ON ac.appointment_id=a.id
       WHERE b.company_id=$1::text
         AND a.status='COMPLETED'
         AND ($2::text IS NULL OR a.branch_id=$2::text)
         AND ($3::timestamptz IS NULL OR a.end_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR a.end_at <= $4::timestamptz)
       GROUP BY b.id,b.name
       ORDER BY revenue DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }

  async byService(filter: ProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH appointment_costs AS (
         SELECT im.reference_id AS appointment_id,
                COALESCE(SUM(jel.debit),0)::numeric AS material_cost
         FROM inventory_movements im
         JOIN journal_entries je ON je."companyId"=im.company_id
           AND je."referenceType"='INVENTORY_CONSUMPTION'
           AND je."referenceId"=im.id
           AND je.status='POSTED'
         JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='740'
         WHERE im.reference_type='APPOINTMENT' AND im.type='SERVICE_CONSUMPTION'
         GROUP BY im.reference_id
       )
       SELECT s.id AS "serviceId",s.name AS "serviceName",
              COUNT(a.id)::int AS "appointmentCount",
              COALESCE(SUM(s.price),0)::numeric AS revenue,
              COALESCE(SUM(ac.material_cost),0)::numeric AS "materialCost"
       FROM appointments a
       JOIN services s ON s.id=a.service_id
       JOIN branches b ON b.id=a.branch_id
       LEFT JOIN appointment_costs ac ON ac.appointment_id=a.id
       WHERE b.company_id=$1::text
         AND a.status='COMPLETED'
         AND ($2::text IS NULL OR a.branch_id=$2::text)
         AND ($3::timestamptz IS NULL OR a.end_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR a.end_at <= $4::timestamptz)
       GROUP BY s.id,s.name
       ORDER BY revenue DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }

  async byStaff(filter: ProfitabilityFilter) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH appointment_costs AS (
         SELECT im.reference_id AS appointment_id,
                COALESCE(SUM(jel.debit),0)::numeric AS material_cost
         FROM inventory_movements im
         JOIN journal_entries je ON je."companyId"=im.company_id
           AND je."referenceType"='INVENTORY_CONSUMPTION'
           AND je."referenceId"=im.id
           AND je.status='POSTED'
         JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='740'
         WHERE im.reference_type='APPOINTMENT' AND im.type='SERVICE_CONSUMPTION'
         GROUP BY im.reference_id
       )
       SELECT st.id AS "staffId",
              CONCAT_WS(' ',st.first_name,st.last_name) AS "staffName",
              COUNT(a.id)::int AS "appointmentCount",
              COALESCE(SUM(s.price),0)::numeric AS revenue,
              COALESCE(SUM(ac.material_cost),0)::numeric AS "materialCost"
       FROM appointments a
       JOIN staff st ON st.id=a.staff_id
       JOIN services s ON s.id=a.service_id
       JOIN branches b ON b.id=a.branch_id
       LEFT JOIN appointment_costs ac ON ac.appointment_id=a.id
       WHERE b.company_id=$1::text
         AND a.status='COMPLETED'
         AND ($2::text IS NULL OR a.branch_id=$2::text)
         AND ($3::timestamptz IS NULL OR a.end_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR a.end_at <= $4::timestamptz)
       GROUP BY st.id,st.first_name,st.last_name
       ORDER BY revenue DESC`,
      ...this.params(filter),
    );
    return this.normalize(rows);
  }

  async summary(filter: ProfitabilityFilter) {
    const branches = await this.byBranch(filter);
    const revenue = this.round(branches.reduce((sum, row) => sum + row.revenue, 0));
    const materialCost = this.round(branches.reduce((sum, row) => sum + row.materialCost, 0));
    const grossProfit = this.round(revenue - materialCost);
    return {
      basis: 'COMPLETED_APPOINTMENT_SERVICE_LIST_PRICE',
      revenue,
      materialCost,
      grossProfit,
      grossMarginPercent: revenue > 0 ? this.round((grossProfit / revenue) * 100) : 0,
      appointmentCount: branches.reduce((sum, row) => sum + row.appointmentCount, 0),
    };
  }
}
