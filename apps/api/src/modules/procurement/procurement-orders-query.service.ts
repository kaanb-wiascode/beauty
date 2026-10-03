import { Injectable, NotFoundException } from '@nestjs/common';
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
              w.branch_id AS "branchId",COUNT(i.id)::int AS "itemCount",
              o.source_type AS "originType",o.source_version AS "originVersion",
              o.supplier_organization_id AS "supplierOrganizationId",
              org.display_name AS "supplierOrganizationName"
       FROM inventory_purchase_orders po
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=po.company_id
       LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
       LEFT JOIN inventory_purchase_order_items i ON i.purchase_order_id=po.id
       LEFT JOIN procurement_purchase_order_origins o
         ON o.purchase_order_id=po.id
        AND o.tenant_id=po.tenant_id
        AND o.company_id=po.company_id
       LEFT JOIN supplier_organizations org ON org.id=o.supplier_organization_id
       WHERE po.company_id=$1::text
         AND ($2::text IS NULL OR w.branch_id=$2::text)
       GROUP BY po.id,s.name,w.name,w.branch_id,o.source_type,o.source_version,
                o.supplier_organization_id,org.display_name
       ORDER BY po.created_at DESC`,
      companyId,
      branchId,
    );
  }

  async getOrigin(purchaseOrderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT po.id AS "purchaseOrderId",po.status AS "purchaseOrderStatus",
              po.total_amount AS "purchaseOrderTotal",w.name AS "warehouseName",
              o.id AS "originId",o.source_type AS "sourceType",
              o.supplier_organization_id AS "supplierOrganizationId",
              org.display_name AS "supplierOrganizationName",
              o.supplier_connection_id AS "supplierConnectionId",
              o.supplier_offer_id AS "supplierOfferId",
              o.supplier_quote_id AS "supplierQuoteId",
              o.source_version AS "sourceVersion",o.currency,
              o.idempotency_key AS "idempotencyKey",
              o.commercial_snapshot AS "commercialSnapshot",
              o.created_by_user_id AS "createdByUserId",
              o.created_at AS "createdAt"
       FROM inventory_purchase_orders po
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=po.company_id
       LEFT JOIN procurement_purchase_order_origins o
         ON o.purchase_order_id=po.id
        AND o.tenant_id=po.tenant_id
        AND o.company_id=po.company_id
       LEFT JOIN supplier_organizations org ON org.id=o.supplier_organization_id
       WHERE po.id=$1::text
         AND po.tenant_id=$2::text
         AND po.company_id=$3::text
         AND ($4::text IS NULL OR w.branch_id=$4::text)
       LIMIT 1`,
      purchaseOrderId,
      tenantId,
      companyId,
      branchId,
    );

    if (!rows.length) {
      throw new NotFoundException('Purchase order not found in active scope.');
    }

    const row = rows[0];
    return {
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderStatus: row.purchaseOrderStatus,
      purchaseOrderTotal: row.purchaseOrderTotal,
      warehouseName: row.warehouseName,
      origin: row.originId
        ? {
            id: row.originId,
            sourceType: row.sourceType,
            supplierOrganizationId: row.supplierOrganizationId,
            supplierOrganizationName: row.supplierOrganizationName,
            supplierConnectionId: row.supplierConnectionId,
            supplierOfferId: row.supplierOfferId,
            supplierQuoteId: row.supplierQuoteId,
            sourceVersion: row.sourceVersion,
            currency: row.currency,
            idempotencyKey: row.idempotencyKey,
            commercialSnapshot: row.commercialSnapshot,
            createdByUserId: row.createdByUserId,
            createdAt: row.createdAt,
          }
        : null,
    };
  }
}
