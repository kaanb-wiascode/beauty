import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementReceiptQueryService {
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

  async getReceiptDetail(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT gr.id,gr.purchase_order_id AS "purchaseOrderId",gr.supplier_bill_id AS "supplierBillId",
              gr.branch_id AS "branchId",gr.received_at AS "receivedAt",gr.reversed_at AS "reversedAt",
              gr.reversal_reason AS "reversalReason",gr.note,
              po.warehouse_id AS "warehouseId",w.name AS "warehouseName",
              po.supplier_id AS "supplierId",s.name AS "supplierName",
              sb.invoice_number AS "invoiceNumber",sb.amount AS "supplierBillAmount",sb.status AS "supplierBillStatus",
              COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=sb.id),0)::numeric AS "paidAmount"
       FROM inventory_goods_receipts gr
       JOIN inventory_purchase_orders po ON po.id=gr.purchase_order_id AND po.tenant_id=gr.tenant_id AND po.company_id=gr.company_id
       JOIN inventory_warehouses w ON w.id=po.warehouse_id AND w.company_id=gr.company_id
       LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id AND s.company_id=gr.company_id
       LEFT JOIN supplier_bills sb ON sb.id=gr.supplier_bill_id AND sb.tenant_id=gr.tenant_id AND sb.company_id=gr.company_id
       WHERE gr.id=$1::text AND gr.tenant_id=$2::text AND gr.company_id=$3::text
         AND ($4::text IS NULL OR gr.branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Goods receipt not found');

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT gri.id,gri.purchase_order_item_id AS "purchaseOrderItemId",gri.product_id AS "productId",
              p.name AS "productName",p.sku,gri.quantity,gri.unit_cost AS "unitCost",
              COALESCE((
                SELECT SUM(pri.quantity)
                FROM inventory_purchase_return_items pri
                JOIN inventory_purchase_returns pr ON pr.id=pri.purchase_return_id
                WHERE pri.goods_receipt_item_id=gri.id
                  AND pr.tenant_id=$2::text AND pr.company_id=$3::text
              ),0)::numeric AS "returnedQuantity",
              GREATEST(gri.quantity-COALESCE((
                SELECT SUM(pri.quantity)
                FROM inventory_purchase_return_items pri
                JOIN inventory_purchase_returns pr ON pr.id=pri.purchase_return_id
                WHERE pri.goods_receipt_item_id=gri.id
                  AND pr.tenant_id=$2::text AND pr.company_id=$3::text
              ),0),0)::numeric AS "returnableQuantity",
              (gri.quantity*gri.unit_cost)::numeric AS "lineTotal"
       FROM inventory_goods_receipt_items gri
       JOIN inventory_products p ON p.id=gri.product_id AND p.tenant_id=$2::text AND p.company_id=$3::text
       WHERE gri.goods_receipt_id=$1::text
       ORDER BY p.name,gri.id`,
      id,
      tenantId,
      companyId,
    );

    return { receipt: rows[0], items };
  }
}
