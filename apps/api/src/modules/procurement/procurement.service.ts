import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface ReceiveItemInput {
  purchaseOrderItemId: string;
  quantity: number;
}

interface ReceivePurchaseOrderInput {
  items: ReceiveItemInput[];
  invoiceNumber?: string;
  dueAt?: Date;
  note?: string;
}

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const existing = await tx.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
      select: { id: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        return tx.chartOfAccount.update({
          where: { id: existing.id },
          data: { active: true },
          select: { id: true },
        });
      }
      return existing;
    }
    return tx.chartOfAccount.create({
      data: { tenantId, companyId, code, name, type },
      select: { id: true },
    });
  }

  private journalNumber(date: Date) {
    return `JE-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  async orderPurchaseOrder(id: string) {
    const { companyId } = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_orders
       SET status='ORDERED',ordered_at=COALESCE(ordered_at,NOW()),updated_at=NOW()
       WHERE id=$1::text AND company_id=$2::text AND status IN ('DRAFT','PENDING','APPROVED')`,
      id,
      companyId,
    );
    if (updated !== 1) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,status FROM inventory_purchase_orders WHERE id=$1::text AND company_id=$2::text LIMIT 1`,
        id,
        companyId,
      );
      if (!rows.length) throw new NotFoundException('Purchase order not found');
      throw new BadRequestException(`Purchase order cannot be ordered from status ${rows[0].status}.`);
    }
    return { id, status: 'ORDERED' };
  }

  async receivePurchaseOrder(id: string, input: ReceivePurchaseOrderInput) {
    const { tenantId, companyId } = this.context();
    if (!input.items.length) throw new BadRequestException('At least one receipt item is required.');
    const ids = input.items.map((item) => item.purchaseOrderItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A purchase order item can only appear once in a receipt.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const orders = await tx.$queryRawUnsafe<any[]>(
          `SELECT po.id,po.status,po.supplier_id AS "supplierId",po.warehouse_id AS "warehouseId",
                  w.branch_id AS "branchId"
           FROM inventory_purchase_orders po
           JOIN inventory_warehouses w ON w.id=po.warehouse_id
           WHERE po.id=$1::text AND po.company_id=$2::text
           FOR UPDATE`,
          id,
          companyId,
        );
        if (!orders.length) throw new NotFoundException('Purchase order not found');
        const order = orders[0];
        if (order.status !== 'ORDERED') {
          throw new BadRequestException('Only ordered purchase orders can be received.');
        }
        if (!order.supplierId) {
          throw new BadRequestException('A supplier is required before receiving a purchase order.');
        }

        const poItems = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,product_id AS "productId",quantity,received_quantity AS "receivedQuantity",unit_cost AS "unitCost"
           FROM inventory_purchase_order_items
           WHERE purchase_order_id=$1::text AND id=ANY($2::text[])
           FOR UPDATE`,
          id,
          ids,
        );
        if (poItems.length !== input.items.length) {
          throw new BadRequestException('One or more receipt items do not belong to this purchase order.');
        }

        const byId = new Map(poItems.map((item) => [item.id, item]));
        let receiptTotal = 0;
        for (const requested of input.items) {
          const item = byId.get(requested.purchaseOrderItemId);
          const quantity = Number(requested.quantity);
          if (!item || !Number.isFinite(quantity) || quantity <= 0) {
            throw new BadRequestException('Receipt quantities must be greater than zero.');
          }
          const remaining = Number(item.quantity) - Number(item.receivedQuantity);
          if (quantity > remaining) {
            throw new BadRequestException(`Receipt quantity exceeds outstanding quantity for item ${item.id}.`);
          }
          receiptTotal += quantity * Number(item.unitCost);
        }
        receiptTotal = this.roundMoney(receiptTotal);

        const receiptId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_goods_receipts(id,tenant_id,company_id,branch_id,purchase_order_id,note)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6)`,
          receiptId,
          tenantId,
          companyId,
          order.branchId,
          id,
          input.note?.trim() || null,
        );

        for (const requested of input.items) {
          const item = byId.get(requested.purchaseOrderItemId)!;
          const quantity = Number(requested.quantity);
          const unitCost = Number(item.unitCost);

          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost)
             VALUES($1::text,$2::text,$3::text,$4,$5)`,
            receiptId,
            item.id,
            item.productId,
            quantity,
            unitCost,
          );

          const stockRows = await tx.$queryRawUnsafe<any[]>(
            `SELECT id,quantity,cost_per_unit AS "costPerUnit"
             FROM inventory_stock WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
            item.productId,
            order.warehouseId,
          );
          const oldQuantity = Number(stockRows[0]?.quantity ?? 0);
          const oldCost = Number(stockRows[0]?.costPerUnit ?? 0);
          const newQuantity = oldQuantity + quantity;
          const weightedCost = newQuantity > 0
            ? this.roundMoney((oldQuantity * oldCost + quantity * unitCost) / newQuantity)
            : unitCost;

          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
             VALUES($1::text,$2::text,$3,$4)
             ON CONFLICT(product_id,warehouse_id)
             DO UPDATE SET quantity=inventory_stock.quantity+EXCLUDED.quantity,
                           cost_per_unit=$4,updated_at=NOW()`,
            item.productId,
            order.warehouseId,
            quantity,
            weightedCost,
          );

          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note)
             VALUES($1::text,$2::text,$3::text,$4::text,'PURCHASE',$5,$6,'GOODS_RECEIPT',$7::text,$8)`,
            tenantId,
            companyId,
            item.productId,
            order.warehouseId,
            quantity,
            unitCost,
            receiptId,
            input.note?.trim() || 'Satın alma mal kabulü',
          );

          await tx.$executeRawUnsafe(
            `UPDATE inventory_purchase_order_items
             SET received_quantity=received_quantity+$2 WHERE id=$1::text`,
            item.id,
            quantity,
          );
        }

        const outstanding = await tx.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS count FROM inventory_purchase_order_items
           WHERE purchase_order_id=$1::text AND received_quantity<quantity`,
          id,
        );
        const fullyReceived = Number(outstanding[0]?.count ?? 0) === 0;
        if (fullyReceived) {
          await tx.$executeRawUnsafe(
            `UPDATE inventory_purchase_orders SET status='RECEIVED',received_at=NOW(),updated_at=NOW() WHERE id=$1::text`,
            id,
          );
        }

        const billId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_bills(
             id,tenant_id,company_id,branch_id,supplier_id,invoice_number,description,amount,due_at,source_type,source_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,'GOODS_RECEIPT',$10::text)`,
          billId,
          tenantId,
          companyId,
          order.branchId,
          order.supplierId,
          input.invoiceNumber?.trim() || null,
          `Mal kabul faturası ${receiptId}`,
          receiptTotal,
          input.dueAt ?? null,
          receiptId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_goods_receipts SET supplier_bill_id=$2::text WHERE id=$1::text`,
          receiptId,
          billId,
        );

        const inventoryAccount = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '150',
          'İlk Madde ve Malzeme',
          'ASSET',
        );
        const payableAccount = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '320',
          'Satıcılar',
          'LIABILITY',
        );
        const now = new Date();
        await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId: order.branchId,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Mal kabul ${receiptId}`,
            referenceType: 'GOODS_RECEIPT',
            referenceId: receiptId,
            postedAt: now,
            lines: {
              create: [
                { accountId: inventoryAccount.id, debit: receiptTotal, credit: 0 },
                { accountId: payableAccount.id, debit: 0, credit: receiptTotal },
              ],
            },
          },
        });

        return {
          receiptId,
          purchaseOrderId: id,
          supplierBillId: billId,
          total: receiptTotal,
          purchaseOrderStatus: fullyReceived ? 'RECEIVED' : 'ORDERED',
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listGoodsReceipts(purchaseOrderId?: string) {
    const { companyId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT gr.id,gr.purchase_order_id AS "purchaseOrderId",gr.supplier_bill_id AS "supplierBillId",
              gr.branch_id AS "branchId",gr.received_at AS "receivedAt",gr.note,
              COALESCE(SUM(i.quantity*i.unit_cost),0)::numeric AS total,
              COUNT(i.id)::int AS "itemCount"
       FROM inventory_goods_receipts gr
       LEFT JOIN inventory_goods_receipt_items i ON i.goods_receipt_id=gr.id
       WHERE gr.company_id=$1::text AND ($2::text IS NULL OR gr.purchase_order_id=$2::text)
       GROUP BY gr.id ORDER BY gr.received_at DESC`,
      companyId,
      purchaseOrderId ?? null,
    );
  }
}
