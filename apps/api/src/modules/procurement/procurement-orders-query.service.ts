import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementOrdersQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list() {
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT po.id,po.status,po.total_amount AS "totalAmount",
              po.ordered_at AS "orderedAt",po.received_at AS "receivedAt",
              s.name AS "supplierName",w.name AS "warehouseName",
              w.branch_id AS "branchId",COUNT(i.id)::int AS "itemCount"
       FROM inventory_purchase_orders po
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=po.company_id
       LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
       LEFT JOIN inventory_purchase_order_items i ON i.purchase_order_id=po.id
       WHERE po.company_id=$1::text
         AND ($2::text IS NULL OR w.branch_id=$2::text)
       GROUP BY po.id,s.name,w.name,w.branch_id
       ORDER BY po.created_at DESC`,
      companyId,
      branchId,
    );
  }
}
