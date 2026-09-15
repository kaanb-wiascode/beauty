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
      `SELECT date_trunc('day',COALESCE(po.ordered_at,po.created_at)) AS date,
              po.status::text AS status,
              COUNT(DISTINCT po.id)::int AS "orderCount",
              COALESCE(SUM(DISTINCT po.total_amount),0)::numeric AS "totalAmount",
              COUNT(i.id)::int AS "itemCount",
              COUNT(DISTINCT CASE WHEN po.received_at IS NOT NULL THEN po.id END)::int AS "receivedCount"
       FROM inventory_purchase_orders po
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=po.company_id
       LEFT JOIN inventory_purchase_order_items i ON i.purchase_order_id=po.id
       WHERE po.tenant_id=$1::text AND po.company_id=$2::text
         AND ($3::text IS NULL OR w.branch_id=$3::text)
         AND COALESCE(po.ordered_at,po.created_at) >= $4::timestamptz
         AND COALESCE(po.ordered_at,po.created_at) <= $5::timestamptz
       GROUP BY date_trunc('day',COALESCE(po.ordered_at,po.created_at)),po.status
       ORDER BY date ASC,po.status ASC`,
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
