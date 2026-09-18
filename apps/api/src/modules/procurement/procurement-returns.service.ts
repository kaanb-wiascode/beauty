import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface PartialPurchaseReturnInput {
  reason: string;
  items: Array<{ goodsReceiptItemId: string; quantity: number }>;
}

@Injectable()
export class ProcurementReturnsService {
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

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private journalNumber(date: Date) {
    return `JE-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
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

  async partialReturn(goodsReceiptId: string, input: PartialPurchaseReturnInput) {
    const { tenantId, companyId, branchId: scopedBranchId } = this.context();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Return reason is required.');
    if (!input.items.length) throw new BadRequestException('At least one return item is required.');

    const itemIds = input.items.map((item) => item.goodsReceiptItemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException('A goods receipt item can only appear once in a partial return.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const receipts = await tx.$queryRawUnsafe<any[]>(
          `SELECT gr.id,gr.purchase_order_id AS "purchaseOrderId",gr.supplier_bill_id AS "supplierBillId",
                  gr.branch_id AS "branchId",gr.reversed_at AS "reversedAt",po.warehouse_id AS "warehouseId"
           FROM inventory_goods_receipts gr
           JOIN inventory_purchase_orders po ON po.id=gr.purchase_order_id
           WHERE gr.id=$1::text AND gr.company_id=$2::text
             AND ($3::text IS NULL OR gr.branch_id=$3::text)
           FOR UPDATE`,
          goodsReceiptId,
          companyId,
          scopedBranchId,
        );
        if (!receipts.length) throw new NotFoundException('Goods receipt not found');
        const receipt = receipts[0];
        if (receipt.reversedAt) throw new BadRequestException('Reversed goods receipts cannot be partially returned.');
        if (!receipt.supplierBillId) throw new BadRequestException('Goods receipt has no linked supplier bill.');

        const bills = await tx.$queryRawUnsafe<any[]>(
          `SELECT sb.id,sb.supplier_id AS "supplierId",sb.status,sb.amount,
                  COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.supplier_bill_id=sb.id),0)::numeric AS paid
           FROM supplier_bills sb
           WHERE sb.id=$1::text AND sb.company_id=$2::text
           FOR UPDATE`,
          receipt.supplierBillId,
          companyId,
        );
        const bill = bills[0];
        if (!bill) throw new BadRequestException('Linked supplier bill not found.');
        if (bill.status === 'CANCELLED') throw new BadRequestException('Linked supplier bill is cancelled.');
        if (Number(bill.paid) !== 0) {
          throw new BadRequestException('Partial returns require supplier payments to be reversed first.');
        }

        const receiptItems = await tx.$queryRawUnsafe<any[]>(
          `SELECT gri.id,gri.purchase_order_item_id AS "purchaseOrderItemId",gri.product_id AS "productId",
                  gri.quantity,gri.unit_cost AS "unitCost",
                  COALESCE((
                    SELECT SUM(pri.quantity)
                    FROM inventory_purchase_return_items pri
                    WHERE pri.goods_receipt_item_id=gri.id
                  ),0)::numeric AS "returnedQuantity"
           FROM inventory_goods_receipt_items gri
           WHERE gri.goods_receipt_id=$1::text AND gri.id=ANY($2::text[])
           ORDER BY gri.id
           FOR UPDATE`,
          goodsReceiptId,
          itemIds,
        );
        if (receiptItems.length !== input.items.length) {
          throw new BadRequestException('One or more return items do not belong to this goods receipt.');
        }

        const byId = new Map(receiptItems.map((item) => [item.id, item]));
        let total = 0;
        for (const requested of input.items) {
          const row = byId.get(requested.goodsReceiptItemId);
          const quantity = Number(requested.quantity);
          if (!row || !Number.isFinite(quantity) || quantity <= 0) {
            throw new BadRequestException('Return quantities must be greater than zero.');
          }
          const availableToReturn = Number(row.quantity) - Number(row.returnedQuantity);
          if (quantity > availableToReturn) {
            throw new BadRequestException(`Return quantity exceeds remaining returnable quantity for receipt item ${row.id}.`);
          }

          const stock = await tx.$queryRawUnsafe<any[]>(
            `SELECT id,quantity FROM inventory_stock
             WHERE product_id=$1::text AND warehouse_id=$2::text
             FOR UPDATE`,
            row.productId,
            receipt.warehouseId,
          );
          if (!stock.length || Number(stock[0].quantity) < quantity) {
            throw new BadRequestException(`Insufficient stock to return product ${row.productId}.`);
          }
          total += quantity * Number(row.unitCost);
        }

        total = this.roundMoney(total);
        if (total <= 0) throw new BadRequestException('Partial return total must be greater than zero.');
        if (total >= Number(bill.amount)) {
          throw new BadRequestException('A partial return must be lower than the current supplier bill amount. Use full goods receipt reversal when returning the entire receipt.');
        }

        const purchaseReturnId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_purchase_returns(
             id,tenant_id,company_id,branch_id,goods_receipt_id,supplier_bill_id,reason,total_amount
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8)`,
          purchaseReturnId,
          tenantId,
          companyId,
          receipt.branchId,
          goodsReceiptId,
          receipt.supplierBillId,
          reason,
          total,
        );

        for (const requested of input.items) {
          const row = byId.get(requested.goodsReceiptItemId)!;
          const quantity = Number(requested.quantity);
          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_purchase_return_items(
               purchase_return_id,goods_receipt_item_id,purchase_order_item_id,product_id,quantity,unit_cost
             ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6)`,
            purchaseReturnId,
            row.id,
            row.purchaseOrderItemId,
            row.productId,
            quantity,
            Number(row.unitCost),
          );
          await tx.$executeRawUnsafe(
            `UPDATE inventory_stock SET quantity=quantity-$3,updated_at=NOW()
             WHERE product_id=$1::text AND warehouse_id=$2::text`,
            row.productId,
            receipt.warehouseId,
            quantity,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_movements(
               tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note
             ) VALUES($1::text,$2::text,$3::text,$4::text,'RETURN',$5,$6,'PURCHASE_RETURN',$7::text,$8)`,
            tenantId,
            companyId,
            row.productId,
            receipt.warehouseId,
            quantity,
            Number(row.unitCost),
            purchaseReturnId,
            reason,
          );
          await tx.$executeRawUnsafe(
            `UPDATE inventory_purchase_order_items
             SET received_quantity=GREATEST(received_quantity-$2,0)
             WHERE id=$1::text`,
            row.purchaseOrderItemId,
            quantity,
          );
        }

        const creditNoteId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_credit_notes(
             id,tenant_id,company_id,branch_id,supplier_id,supplier_bill_id,purchase_return_id,amount,reason
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9)`,
          creditNoteId,
          tenantId,
          companyId,
          receipt.branchId,
          bill.supplierId,
          receipt.supplierBillId,
          purchaseReturnId,
          total,
          reason,
        );

        await tx.$executeRawUnsafe(
          `UPDATE supplier_bills
           SET amount=amount-$2,status='OPEN',updated_at=NOW()
           WHERE id=$1::text`,
          receipt.supplierBillId,
          total,
        );

        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_orders
           SET status='ORDERED',received_at=NULL,updated_at=NOW()
           WHERE id=$1::text AND status='RECEIVED'`,
          receipt.purchaseOrderId,
        );

        const inventoryAccount = await this.ensureAccount(tx, tenantId, companyId, '150', 'İlk Madde ve Malzeme', 'ASSET');
        const payableAccount = await this.ensureAccount(tx, tenantId, companyId, '320', 'Satıcılar', 'LIABILITY');
        const now = new Date();
        await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId: receipt.branchId,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Kısmi satın alma iadesi ${purchaseReturnId}`,
            referenceType: 'PURCHASE_RETURN',
            referenceId: purchaseReturnId,
            postedAt: now,
            lines: { create: [
              { accountId: payableAccount.id, debit: total, credit: 0 },
              { accountId: inventoryAccount.id, debit: 0, credit: total },
            ] },
          },
        });

        return {
          purchaseReturnId,
          goodsReceiptId,
          purchaseOrderId: receipt.purchaseOrderId,
          supplierBillId: receipt.supplierBillId,
          supplierCreditNoteId: creditNoteId,
          returnedTotal: total,
          supplierBillRemainingAmount: this.roundMoney(Number(bill.amount) - total),
          status: 'POSTED',
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listReturns(goodsReceiptId?: string) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pr.id,pr.goods_receipt_id AS "goodsReceiptId",pr.supplier_bill_id AS "supplierBillId",
              pr.branch_id AS "branchId",pr.reason,pr.total_amount AS "totalAmount",pr.created_at AS "createdAt",
              scn.id AS "supplierCreditNoteId",scn.amount AS "creditNoteAmount",
              COUNT(pri.id)::int AS "itemCount"
       FROM inventory_purchase_returns pr
       LEFT JOIN inventory_purchase_return_items pri ON pri.purchase_return_id=pr.id
       LEFT JOIN supplier_credit_notes scn ON scn.purchase_return_id=pr.id
       WHERE pr.company_id=$1::text
         AND ($2::text IS NULL OR pr.branch_id=$2::text)
         AND ($3::text IS NULL OR pr.goods_receipt_id=$3::text)
       GROUP BY pr.id,scn.id
       ORDER BY pr.created_at DESC`,
      companyId,
      branchId,
      goodsReceiptId ?? null,
    );
  }

  async listCreditNotes(supplierBillId?: string) {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT scn.id,scn.supplier_id AS "supplierId",scn.supplier_bill_id AS "supplierBillId",
              scn.purchase_return_id AS "purchaseReturnId",scn.branch_id AS "branchId",
              scn.amount,scn.reason,scn.created_at AS "createdAt"
       FROM supplier_credit_notes scn
       WHERE scn.company_id=$1::text
         AND ($2::text IS NULL OR scn.branch_id=$2::text)
         AND ($3::text IS NULL OR scn.supplier_bill_id=$3::text)
       ORDER BY scn.created_at DESC`,
      companyId,
      branchId,
      supplierBillId ?? null,
    );
  }
}
