import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementReturnQueryService {
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

  async getPurchaseReturnDetail(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pr.id,pr.goods_receipt_id AS "goodsReceiptId",pr.supplier_bill_id AS "supplierBillId",
              pr.branch_id AS "branchId",pr.reason,pr.total_amount AS "totalAmount",pr.created_at AS "createdAt",
              gr.purchase_order_id AS "purchaseOrderId",po.warehouse_id AS "warehouseId",w.name AS "warehouseName",
              po.supplier_id AS "supplierId",s.name AS "supplierName"
       FROM inventory_purchase_returns pr
       JOIN inventory_goods_receipts gr ON gr.id=pr.goods_receipt_id AND gr.tenant_id=pr.tenant_id AND gr.company_id=pr.company_id
       JOIN inventory_purchase_orders po ON po.id=gr.purchase_order_id AND po.tenant_id=pr.tenant_id AND po.company_id=pr.company_id
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=pr.company_id
       LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id AND s.company_id=pr.company_id
       WHERE pr.id=$1::text AND pr.tenant_id=$2::text AND pr.company_id=$3::text
         AND ($4::text IS NULL OR pr.branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Purchase return not found');

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pri.id,pri.goods_receipt_item_id AS "goodsReceiptItemId",pri.purchase_order_item_id AS "purchaseOrderItemId",
              pri.product_id AS "productId",p.name AS "productName",p.sku,pri.quantity,pri.unit_cost AS "unitCost",
              COALESCE((
                SELECT SUM(ri.quantity)
                FROM inventory_purchase_replacement_items ri
                JOIN inventory_purchase_replacement_requests rr ON rr.id=ri.replacement_request_id
                WHERE ri.purchase_return_item_id=pri.id
                  AND rr.tenant_id=$2::text AND rr.company_id=$3::text
                  AND rr.status <> 'REJECTED'
              ),0)::numeric AS "replacementQuantity",
              GREATEST(pri.quantity-COALESCE((
                SELECT SUM(ri.quantity)
                FROM inventory_purchase_replacement_items ri
                JOIN inventory_purchase_replacement_requests rr ON rr.id=ri.replacement_request_id
                WHERE ri.purchase_return_item_id=pri.id
                  AND rr.tenant_id=$2::text AND rr.company_id=$3::text
                  AND rr.status <> 'REJECTED'
              ),0),0)::numeric AS "remainingReplacementQuantity"
       FROM inventory_purchase_return_items pri
       JOIN inventory_products p ON p.id=pri.product_id AND p.tenant_id=$2::text AND p.company_id=$3::text
       WHERE pri.purchase_return_id=$1::text
       ORDER BY p.name,pri.id`,
      id,
      tenantId,
      companyId,
    );

    return { purchaseReturn: rows[0], items };
  }
}
