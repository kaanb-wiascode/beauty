import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class InventoryValuationReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async detail(warehouseId?: string) {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT w.id AS "warehouseId",w.name AS "warehouseName",w.type AS "warehouseType",w.branch_id AS "branchId",
              p.id AS "productId",p.name AS "productName",p.sku,p.unit,
              s.quantity,s.cost_per_unit AS "unitCost",
              ROUND((s.quantity*s.cost_per_unit)::numeric,2) AS "inventoryValue",
              s.minimum_quantity AS "minimumQuantity",s.target_quantity AS "targetQuantity",
              s.updated_at AS "stockUpdatedAt"
       FROM inventory_stock s
       JOIN inventory_warehouses w ON w.id=s.warehouse_id
       JOIN inventory_products p ON p.id=s.product_id
       WHERE w.tenant_id=$1::text AND w.company_id=$2::text AND w.status='ACTIVE'
         AND p.company_id=$2::text AND p.status='ACTIVE'
         AND ($3::text IS NULL OR w.branch_id=$3::text)
         AND ($4::text IS NULL OR w.id=$4::text)
       ORDER BY w.type,w.name,p.name`,
      tenantId, companyId, branchId, warehouseId ?? null,
    );
  }

  async movementSummary(from?: Date, to?: Date, warehouseId?: string) {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m.type,
              COUNT(*)::int AS "movementCount",
              COALESCE(SUM(m.quantity),0)::numeric AS quantity,
              COALESCE(SUM(m.quantity*COALESCE(m.unit_cost,0)),0)::numeric AS "movementValue"
       FROM inventory_movements m
       JOIN inventory_warehouses w ON w.id=m.warehouse_id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text
         AND ($3::text IS NULL OR w.branch_id=$3::text)
         AND ($4::text IS NULL OR m.warehouse_id=$4::text)
         AND ($5::timestamptz IS NULL OR m.created_at >= $5::timestamptz)
         AND ($6::timestamptz IS NULL OR m.created_at <= $6::timestamptz)
       GROUP BY m.type ORDER BY m.type`,
      tenantId, companyId, branchId, warehouseId ?? null, from ?? null, to ?? null,
    );
  }

  async inTransit() {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id AS "transferId",t.dispatched_at AS "dispatchedAt",t.total_value AS "totalValue",
              sw.id AS "sourceWarehouseId",sw.name AS "sourceWarehouseName",
              dw.id AS "destinationWarehouseId",dw.name AS "destinationWarehouseName",
              COUNT(i.id)::int AS "itemCount",
              COALESCE(SUM(i.dispatched_quantity-i.received_quantity),0)::numeric AS "unitsInTransit",
              COALESCE(SUM((i.dispatched_quantity-i.received_quantity)*i.unit_cost_snapshot),0)::numeric AS "valueInTransit"
       FROM inventory_transfers t
       JOIN inventory_warehouses sw ON sw.id=t.source_warehouse_id
       JOIN inventory_warehouses dw ON dw.id=t.destination_warehouse_id
       JOIN inventory_transfer_items i ON i.transfer_id=t.id
       WHERE t.tenant_id=$1::text AND t.company_id=$2::text AND t.status='IN_TRANSIT'
         AND ($3::text IS NULL OR sw.branch_id=$3::text OR dw.branch_id=$3::text)
       GROUP BY t.id,sw.id,dw.id ORDER BY t.dispatched_at DESC`,
      tenantId, companyId, branchId,
    );
  }
}
