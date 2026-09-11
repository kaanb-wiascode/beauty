import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface ReplacementRequestInput {
  reason: string;
  items: Array<{ purchaseReturnItemId: string; quantity: number }>;
}

@Injectable()
export class ProcurementReplacementsService {
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

  private normalizeRole(value: string | null | undefined) {
    return (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private journalNumber(date: Date) {
    return `JE-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async assertApprover(userId: string, branchId: string | null) {
    const { tenantId, companyId, branchId: activeBranchId } = this.context();
    if (activeBranchId && branchId && activeBranchId !== branchId) {
      throw new ForbiddenException('Replacement request is outside active branch scope.');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.slug AS "roleSlug",r.name AS "roleName",r.scope AS "roleScope",
              EXISTS(SELECT 1 FROM membership_branch_access mba WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text) AS "hasBranchAccess"
       FROM memberships m JOIN roles r ON r.id=m."roleId"
       WHERE m."userId"=$1::text AND m."tenantId"=$2::text AND m.status='ACTIVE'
         AND (m."companyId" IS NULL OR m."companyId"=$3::text)
       LIMIT 1`,
      userId,
      tenantId,
      companyId,
      branchId,
    );
    const actor = rows[0];
    if (!actor) throw new ForbiddenException('Approver has no active membership in tenant scope.');
    if (actor.roleScope === 'BRANCH' && branchId && !actor.hasBranchAccess && activeBranchId !== branchId) {
      throw new ForbiddenException('Approver has no access to replacement request branch.');
    }
    const identities = new Set([this.normalizeRole(actor.roleSlug), this.normalizeRole(actor.roleName)]);
    const allowed = ['manager','branch-manager','company-manager','general-manager','finance','finance-manager','finance-director','cfo','director','owner','admin','super-admin'];
    if (!allowed.some((role) => identities.has(role))) {
      throw new ForbiddenException('Replacement approval requires manager or higher authority.');
    }
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
        return tx.chartOfAccount.update({ where: { id: existing.id }, data: { active: true }, select: { id: true } });
      }
      return existing;
    }
    return tx.chartOfAccount.create({ data: { tenantId, companyId, code, name, type }, select: { id: true } });
  }

  async submit(purchaseReturnId: string, input: ReplacementRequestInput, userId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Replacement reason is required.');
    if (!input.items.length) throw new BadRequestException('At least one replacement item is required.');
    const ids = input.items.map((item) => item.purchaseReturnItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Replacement items must be unique.');

    return this.prisma.$transaction(async (tx) => {
      const returns = await tx.$queryRawUnsafe<any[]>(
        `SELECT pr.id,pr.goods_receipt_id AS "goodsReceiptId",pr.supplier_bill_id AS "supplierBillId",pr.branch_id AS "branchId"
         FROM inventory_purchase_returns pr
         WHERE pr.id=$1::text AND pr.company_id=$2::text
           AND ($3::text IS NULL OR pr.branch_id=$3::text)
         FOR UPDATE`,
        purchaseReturnId,
        companyId,
        branchId,
      );
      if (!returns.length) throw new NotFoundException('Purchase return not found.');
      const purchaseReturn = returns[0];

      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT pri.id,pri.purchase_order_item_id AS "purchaseOrderItemId",pri.product_id AS "productId",
                pri.quantity,pri.unit_cost AS "unitCost",
                COALESCE((SELECT SUM(ri.quantity) FROM inventory_purchase_replacement_items ri
                          JOIN inventory_purchase_replacement_requests rr ON rr.id=ri.replacement_request_id
                          WHERE ri.purchase_return_item_id=pri.id AND rr.status <> 'REJECTED'),0)::numeric AS "replacementQuantity"
         FROM inventory_purchase_return_items pri
         WHERE pri.purchase_return_id=$1::text AND pri.id=ANY($2::text[])
         ORDER BY pri.id
         FOR UPDATE`,
        purchaseReturnId,
        ids,
      );
      if (rows.length !== input.items.length) {
        throw new BadRequestException('One or more replacement items do not belong to this purchase return.');
      }
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const requested of input.items) {
        const row = byId.get(requested.purchaseReturnItemId);
        const quantity = Number(requested.quantity);
        if (!row || !Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException('Replacement quantities must be greater than zero.');
        }
        const remaining = Number(row.quantity) - Number(row.replacementQuantity);
        if (quantity > remaining) {
          throw new BadRequestException(`Replacement quantity exceeds remaining returned quantity for return item ${row.id}.`);
        }
      }

      const requestId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_purchase_replacement_requests(
           id,tenant_id,company_id,branch_id,purchase_return_id,goods_receipt_id,supplier_bill_id,reason,requested_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9::text)`,
        requestId,
        tenantId,
        companyId,
        purchaseReturn.branchId,
        purchaseReturnId,
        purchaseReturn.goodsReceiptId,
        purchaseReturn.supplierBillId,
        reason,
        userId,
      );
      for (const requested of input.items) {
        const row = byId.get(requested.purchaseReturnItemId)!;
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_purchase_replacement_items(
             id,replacement_request_id,purchase_return_item_id,purchase_order_item_id,product_id,quantity,unit_cost
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7)`,
          randomUUID(),
          requestId,
          row.id,
          row.purchaseOrderItemId,
          row.productId,
          Number(requested.quantity),
          Number(row.unitCost),
        );
      }
      return (await this.list()).find((item) => item.id === requestId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async list(status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECEIVED') {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT rr.id,rr.purchase_return_id AS "purchaseReturnId",rr.goods_receipt_id AS "goodsReceiptId",
              rr.supplier_bill_id AS "supplierBillId",rr.branch_id AS "branchId",rr.status,rr.reason,
              rr.requested_by_user_id AS "requestedByUserId",rr.approved_by_user_id AS "approvedByUserId",
              rr.approved_at AS "approvedAt",rr.rejected_by_user_id AS "rejectedByUserId",rr.rejected_at AS "rejectedAt",
              rr.rejection_reason AS "rejectionReason",rr.received_by_user_id AS "receivedByUserId",
              rr.received_at AS "receivedAt",rr.replacement_receipt_id AS "replacementReceiptId",
              rr.created_at AS "createdAt",COUNT(ri.id)::int AS "itemCount",
              COALESCE(SUM(ri.quantity*ri.unit_cost),0)::numeric AS "totalAmount"
       FROM inventory_purchase_replacement_requests rr
       LEFT JOIN inventory_purchase_replacement_items ri ON ri.replacement_request_id=rr.id
       WHERE rr.company_id=$1::text AND ($2::text IS NULL OR rr.branch_id=$2::text)
         AND ($3::text IS NULL OR rr.status=$3::text)
       GROUP BY rr.id
       ORDER BY rr.created_at DESC`,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async approve(id: string, userId: string) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId" FROM inventory_purchase_replacement_requests
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Replacement request not found.');
    if (rows[0].status !== 'PENDING') throw new BadRequestException('Only pending replacement requests can be approved.');
    await this.assertApprover(userId, rows[0].branchId);
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_replacement_requests
       SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND status='PENDING'`,
      id,
      userId,
    );
    if (updated !== 1) throw new BadRequestException('Replacement request changed concurrently.');
    return (await this.list()).find((item) => item.id === id);
  }

  async reject(id: string, userId: string, reason: string) {
    const { companyId, branchId } = this.context();
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('Rejection reason is required.');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId" FROM inventory_purchase_replacement_requests
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Replacement request not found.');
    if (rows[0].status !== 'PENDING') throw new BadRequestException('Only pending replacement requests can be rejected.');
    await this.assertApprover(userId, rows[0].branchId);
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_replacement_requests
       SET status='REJECTED',rejected_by_user_id=$2::text,rejected_at=NOW(),rejection_reason=$3,updated_at=NOW()
       WHERE id=$1::text AND status='PENDING'`,
      id,
      userId,
      cleanReason,
    );
    if (updated !== 1) throw new BadRequestException('Replacement request changed concurrently.');
    return (await this.list()).find((item) => item.id === id);
  }

  async receive(id: string, userId: string, note?: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const requests = await tx.$queryRawUnsafe<any[]>(
        `SELECT rr.id,rr.status,rr.purchase_return_id AS "purchaseReturnId",rr.goods_receipt_id AS "goodsReceiptId",
                rr.supplier_bill_id AS "supplierBillId",rr.branch_id AS "branchId",gr.purchase_order_id AS "purchaseOrderId",
                po.warehouse_id AS "warehouseId"
         FROM inventory_purchase_replacement_requests rr
         JOIN inventory_goods_receipts gr ON gr.id=rr.goods_receipt_id
         JOIN inventory_purchase_orders po ON po.id=gr.purchase_order_id
         WHERE rr.id=$1::text AND rr.company_id=$2::text
           AND ($3::text IS NULL OR rr.branch_id=$3::text)
         FOR UPDATE`,
        id,
        companyId,
        branchId,
      );
      if (!requests.length) throw new NotFoundException('Replacement request not found.');
      const request = requests[0];
      if (request.status !== 'APPROVED') throw new BadRequestException('Only approved replacement requests can be received.');

      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,purchase_return_item_id AS "purchaseReturnItemId",purchase_order_item_id AS "purchaseOrderItemId",
                product_id AS "productId",quantity,unit_cost AS "unitCost",received_quantity AS "receivedQuantity"
         FROM inventory_purchase_replacement_items
         WHERE replacement_request_id=$1::text
         ORDER BY id
         FOR UPDATE`,
        id,
      );
      if (!items.length) throw new BadRequestException('Replacement request has no items.');
      if (items.some((item) => Number(item.receivedQuantity) !== 0)) {
        throw new BadRequestException('Replacement request has already been partially or fully received.');
      }

      const billRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,amount FROM supplier_bills WHERE id=$1::text AND company_id=$2::text FOR UPDATE`,
        request.supplierBillId,
        companyId,
      );
      const bill = billRows[0];
      if (!bill || bill.status === 'CANCELLED') throw new BadRequestException('Linked supplier bill is unavailable for replacement receipt.');

      let total = 0;
      for (const item of items) total += Number(item.quantity) * Number(item.unitCost);
      total = this.roundMoney(total);
      if (total <= 0) throw new BadRequestException('Replacement receipt total must be greater than zero.');

      const replacementReceiptId = randomUUID();
      for (const item of items) {
        const stockRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId,
          request.warehouseId,
        );
        const oldQuantity = Number(stockRows[0]?.quantity ?? 0);
        const oldCost = Number(stockRows[0]?.costPerUnit ?? 0);
        const quantity = Number(item.quantity);
        const unitCost = Number(item.unitCost);
        const newQuantity = oldQuantity + quantity;
        const weightedCost = newQuantity > 0
          ? this.roundMoney((oldQuantity * oldCost + quantity * unitCost) / newQuantity)
          : unitCost;
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
           VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET quantity=inventory_stock.quantity+EXCLUDED.quantity,cost_per_unit=$4,updated_at=NOW()`,
          item.productId,
          request.warehouseId,
          quantity,
          weightedCost,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note)
           VALUES($1::text,$2::text,$3::text,$4::text,'PURCHASE',$5,$6,'PURCHASE_REPLACEMENT',$7::text,$8)`,
          tenantId,
          companyId,
          item.productId,
          request.warehouseId,
          quantity,
          unitCost,
          id,
          note?.trim() || 'Tedarikçi replacement yeniden teslimatı',
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_order_items SET received_quantity=received_quantity+$2 WHERE id=$1::text`,
          item.purchaseOrderItemId,
          quantity,
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_replacement_items SET received_quantity=quantity WHERE id=$1::text`,
          item.id,
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE supplier_bills SET amount=amount+$2,status='OPEN',updated_at=NOW() WHERE id=$1::text`,
        request.supplierBillId,
        total,
      );
      const outstanding = await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count FROM inventory_purchase_order_items
         WHERE purchase_order_id=$1::text AND received_quantity<quantity`,
        request.purchaseOrderId,
      );
      if (Number(outstanding[0]?.count ?? 0) === 0) {
        await tx.$executeRawUnsafe(
          `UPDATE inventory_purchase_orders SET status='RECEIVED',received_at=NOW(),updated_at=NOW() WHERE id=$1::text`,
          request.purchaseOrderId,
        );
      }

      const inventoryAccount = await this.ensureAccount(tx, tenantId, companyId, '150', 'İlk Madde ve Malzeme', 'ASSET');
      const payableAccount = await this.ensureAccount(tx, tenantId, companyId, '320', 'Satıcılar', 'LIABILITY');
      const now = new Date();
      await tx.journalEntry.create({
        data: {
          tenantId,
          companyId,
          branchId: request.branchId,
          number: this.journalNumber(now),
          status: 'POSTED',
          entryDate: now,
          description: `Replacement yeniden teslimat ${id}`,
          referenceType: 'PURCHASE_REPLACEMENT',
          referenceId: id,
          postedAt: now,
          lines: { create: [
            { accountId: inventoryAccount.id, debit: total, credit: 0 },
            { accountId: payableAccount.id, debit: 0, credit: total },
          ] },
        },
      });
      const updated = await tx.$executeRawUnsafe(
        `UPDATE inventory_purchase_replacement_requests
         SET status='RECEIVED',received_by_user_id=$2::text,received_at=NOW(),replacement_receipt_id=$3::text,updated_at=NOW()
         WHERE id=$1::text AND status='APPROVED'`,
        id,
        userId,
        replacementReceiptId,
      );
      if (updated !== 1) throw new BadRequestException('Replacement request changed concurrently.');
      return {
        replacementRequestId: id,
        replacementReceiptId,
        purchaseReturnId: request.purchaseReturnId,
        purchaseOrderId: request.purchaseOrderId,
        supplierBillId: request.supplierBillId,
        receivedTotal: total,
        status: 'RECEIVED',
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
