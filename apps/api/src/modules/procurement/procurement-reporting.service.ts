import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type ProcurementReportingInput = Readonly<{ from: Date; to: Date }>;

@Injectable()
export class ProcurementReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async performance(input: ProcurementReportingInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    const rows = await this.prisma.$queryRawUnsafe<Array<{
      date: Date;
      status: string;
      orderCount: number;
      totalAmount: unknown;
      itemCount: number;
      receivedCount: number;
    }>>(
      `WITH scoped_orders AS (
         SELECT po.id,po.status::text AS status,po.total_amount,
                COALESCE(po.ordered_at,po.created_at) AS effective_at,
                po.received_at,
                (SELECT COUNT(*)::int FROM inventory_purchase_order_items i WHERE i.purchase_order_id=po.id) AS item_count
         FROM inventory_purchase_orders po
         JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=po.company_id
         WHERE po.tenant_id=$1::text AND po.company_id=$2::text
           AND ($3::text IS NULL OR w.branch_id=$3::text)
           AND COALESCE(po.ordered_at,po.created_at) >= $4::timestamptz
           AND COALESCE(po.ordered_at,po.created_at) <= $5::timestamptz
       )
       SELECT date_trunc('day',effective_at) AS date,
              status,
              COUNT(*)::int AS "orderCount",
              COALESCE(SUM(total_amount),0)::numeric AS "totalAmount",
              COALESCE(SUM(item_count),0)::int AS "itemCount",
              COUNT(*) FILTER (WHERE received_at IS NOT NULL)::int AS "receivedCount"
       FROM scoped_orders
       GROUP BY date_trunc('day',effective_at),status
       ORDER BY date ASC,status ASC`,
      tenantId,
      companyId,
      branchId,
      input.from,
      input.to,
    );

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      status: row.status,
      orderCount: Number(row.orderCount),
      totalAmount: Number(row.totalAmount ?? 0),
      itemCount: Number(row.itemCount),
      receivedCount: Number(row.receivedCount),
      receiptRate: Number(row.orderCount)
        ? Math.round((Number(row.receivedCount) / Number(row.orderCount)) * 100)
        : 0,
    }));
  }
}
