import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class InventoryTransferReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async receive(id: string, userId: string) {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT t.id,t.status,t.destination_warehouse_id AS "destinationWarehouseId",t.total_value AS "totalValue",
                dw.branch_id AS "destinationBranchId"
         FROM inventory_transfers t
         JOIN inventory_warehouses dw ON dw.id=t.destination_warehouse_id
         JOIN inventory_warehouses sw ON sw.id=t.source_warehouse_id
         WHERE t.id=$1::text AND t.tenant_id=$2::text AND t.company_id=$3::text
           AND ($4::text IS NULL OR sw.branch_id=$4::text OR dw.branch_id=$4::text)
         FOR UPDATE`,
        id, tenantId, companyId, branchId,
      );
      if (!rows.length) throw new NotFoundException('Transfer not found.');
      const transfer = rows[0];
      if (transfer.status === 'RECEIVED') throw new BadRequestException('Transfer has already been received.');
      if (transfer.status !== 'IN_TRANSIT') throw new BadRequestException('Only in-transit transfers can be received.');

      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.id,i.product_id AS "productId",i.quantity,i.dispatched_quantity AS "dispatchedQuantity",
                i.received_quantity AS "receivedQuantity",i.unit_cost_snapshot AS "unitCost",i.line_value AS "lineValue"
         FROM inventory_transfer_items i
         JOIN inventory_products p ON p.id=i.product_id AND p.company_id=$2::text
         WHERE i.transfer_id=$1::text ORDER BY i.id FOR UPDATE`,
        id, companyId,
      );
      if (!items.length) throw new BadRequestException('Transfer has no items.');
      let receivedValue = 0;
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (Number(item.dispatchedQuantity) !== quantity) throw new BadRequestException(`Transfer item ${item.id} was not fully dispatched.`);
        if (Number(item.receivedQuantity) !== 0) throw new BadRequestException(`Transfer item ${item.id} has already been received.`);
        const unitCost = Number(item.unitCost ?? 0);
        receivedValue = this.round(receivedValue + Number(item.lineValue ?? quantity * unitCost));
        const destination = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, transfer.destinationWarehouseId,
        );
        const oldQty = Number(destination[0]?.quantity ?? 0);
        const oldCost = Number(destination[0]?.costPerUnit ?? 0);
        const newQty = oldQty + quantity;
        const weightedCost = newQty > 0 ? this.round((oldQty * oldCost + quantity * unitCost) / newQty) : unitCost;
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
           VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET quantity=inventory_stock.quantity+EXCLUDED.quantity,cost_per_unit=$4,updated_at=NOW()`,
          item.productId, transfer.destinationWarehouseId, quantity, weightedCost,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id)
           VALUES($1::text,$2::text,$3::text,$4::text,'TRANSFER_IN',$5,$6,'WAREHOUSE_TRANSFER',$7::text,'Transfer teslim alındı',$8::text)`,
          tenantId, companyId, item.productId, transfer.destinationWarehouseId, quantity, unitCost, id, userId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_transfer_items SET received_quantity=quantity WHERE id=$1::text`, item.id,
        );
      }
      const updated = await tx.$executeRawUnsafe(
        `UPDATE inventory_transfers SET status='RECEIVED',received_at=NOW(),updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='IN_TRANSIT'`,
        id, tenantId, companyId,
      );
      if (updated !== 1) throw new BadRequestException('Transfer changed concurrently.');
      return { transferId: id, status: 'RECEIVED', totalValue: receivedValue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
