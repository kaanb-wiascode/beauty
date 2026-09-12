import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface ConvertPurchaseRequestInput {
  supplierId: string;
  unitCost: number;
  note?: string;
}

@Injectable()
export class ProcurementRequestsService {
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

  async listPurchaseRequests(status?: string) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pr.id,pr.status,pr.warehouse_id AS "warehouseId",w.name AS "warehouseName",
              pr.product_id AS "productId",p.name AS "productName",p.sku,
              pr.current_quantity AS "currentQuantity",pr.requested_quantity AS "requestedQuantity",
              pr.reason,pr.approved_at AS "approvedAt",pr.converted_at AS "convertedAt",
              pr.converted_purchase_order_id AS "convertedPurchaseOrderId",pr.created_at AS "createdAt"
       FROM inventory_purchase_requests pr
       JOIN inventory_warehouses w ON w.id=pr.warehouse_id AND w.company_id=pr.company_id
       JOIN inventory_products p ON p.id=pr.product_id AND p.company_id=pr.company_id
       WHERE pr.company_id=$1::text
         AND ($2::text IS NULL OR w.branch_id=$2::text)
         AND ($3::text IS NULL OR pr.status::text=$3::text)
       ORDER BY pr.created_at DESC`,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async approvePurchaseRequest(id: string) {
    const { companyId, branchId } = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_requests pr
       SET status='APPROVED',approved_at=NOW(),updated_at=NOW()
       FROM inventory_warehouses w
       WHERE pr.warehouse_id=w.id
         AND w.company_id=pr.company_id
         AND pr.id=$1::text
         AND pr.company_id=$2::text
         AND ($3::text IS NULL OR w.branch_id=$3::text)
         AND pr.status='PENDING'`,
      id,
      companyId,
      branchId,
    );
    if (updated !== 1) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pr.id,pr.status
         FROM inventory_purchase_requests pr
         JOIN inventory_warehouses w ON w.id=pr.warehouse_id AND w.company_id=pr.company_id
         WHERE pr.id=$1::text
           AND pr.company_id=$2::text
           AND ($3::text IS NULL OR w.branch_id=$3::text)
         LIMIT 1`,
        id,
        companyId,
        branchId,
      );
      if (!rows.length) throw new NotFoundException('Purchase request not found');
      throw new BadRequestException(`Purchase request cannot be approved from status ${rows[0].status}.`);
    }
    return { id, status: 'APPROVED' };
  }

  async convertPurchaseRequest(id: string, input: ConvertPurchaseRequestInput) {
    const { tenantId, companyId, branchId } = this.context();
    const unitCost = Math.round((Number(input.unitCost) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new BadRequestException('Unit cost must be zero or greater.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const requests = await tx.$queryRawUnsafe<any[]>(
          `SELECT pr.id,pr.status,pr.warehouse_id AS "warehouseId",pr.product_id AS "productId",
                  pr.requested_quantity AS "requestedQuantity",pr.converted_purchase_order_id AS "convertedPurchaseOrderId"
           FROM inventory_purchase_requests pr
           JOIN inventory_warehouses w ON w.id=pr.warehouse_id AND w.company_id=pr.company_id
           WHERE pr.id=$1::text
             AND pr.company_id=$2::text
             AND ($3::text IS NULL OR w.branch_id=$3::text)
           FOR UPDATE OF pr`,
          id,
          companyId,
          branchId,
        );
        if (!requests.length) throw new NotFoundException('Purchase request not found');
        const request = requests[0];
        if (request.status !== 'APPROVED') {
          throw new BadRequestException('Only approved purchase requests can be converted.');
        }
        if (request.convertedPurchaseOrderId) {
          throw new BadRequestException('Purchase request has already been converted.');
        }

        const suppliers = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM inventory_suppliers
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE' LIMIT 1`,
          input.supplierId,
          tenantId,
          companyId,
        );
        if (!suppliers.length) throw new NotFoundException('Supplier not found');

        const quantity = Number(request.requestedQuantity);
        const total = Math.round((quantity * unitCost + Number.EPSILON) * 100) / 100;
        const orders = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO inventory_purchase_orders(
             tenant_id,company_id,supplier_id,warehouse_id,status,total_amount,note
           ) VALUES($1::text,$2::text,$3::text,$4::text,'APPROVED',$5,$6)
           RETURNING id,status,total_amount AS "totalAmount"`,
          tenantId,
          companyId,
          input.supplierId,
          request.warehouseId,
          total,
          input.note?.trim() || `Satın alma talebinden oluşturuldu: ${id}`,
        );
        const order = orders[0];

        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_purchase_order_items(purchase_order_id,product_id,quantity,unit_cost)
           VALUES($1::text,$2::text,$3,$4)`,
          order.id,
          request.productId,
          quantity,
          unitCost,
        );

        const updated = await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_requests
           SET status='ORDERED',converted_at=NOW(),converted_purchase_order_id=$2::text,updated_at=NOW()
           WHERE id=$1::text AND status='APPROVED' AND converted_purchase_order_id IS NULL`,
          id,
          order.id,
        );
        if (updated !== 1) {
          throw new BadRequestException('Purchase request is no longer convertible.');
        }

        return {
          purchaseRequestId: id,
          purchaseRequestStatus: 'ORDERED',
          purchaseOrderId: order.id,
          purchaseOrderStatus: order.status,
          total: Number(order.totalAmount),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
