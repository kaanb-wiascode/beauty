import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ProcurementReturnsService, PartialPurchaseReturnInput } from './procurement-returns.service';

@Injectable()
export class ProcurementReturnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly returns: ProcurementReturnsService,
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

  private async assertApprover(userId: string, branchId: string | null) {
    const { tenantId, companyId, branchId: activeBranchId } = this.context();
    if (activeBranchId && branchId && activeBranchId !== branchId) {
      throw new ForbiddenException('Return request is outside active branch scope.');
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
      throw new ForbiddenException('Approver has no access to return request branch.');
    }
    const identities = new Set([this.normalizeRole(actor.roleSlug), this.normalizeRole(actor.roleName)]);
    const allowed = ['manager','branch-manager','company-manager','general-manager','finance','finance-manager','finance-director','cfo','director','owner','admin','super-admin'];
    if (!allowed.some((role) => identities.has(role))) {
      throw new ForbiddenException('Return approval requires manager or higher authority.');
    }
  }

  async submit(goodsReceiptId: string, input: PartialPurchaseReturnInput, userId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Return reason is required.');
    if (!input.items.length) throw new BadRequestException('At least one return item is required.');
    const ids = input.items.map((item) => item.goodsReceiptItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Return items must be unique.');
    if (input.items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      throw new BadRequestException('Return quantities must be greater than zero.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const receipts = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId",reversed_at AS "reversedAt"
           FROM inventory_goods_receipts
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text IS NULL OR branch_id=$4::text)
           FOR UPDATE`,
          goodsReceiptId,
          tenantId,
          companyId,
          branchId,
        );
        if (!receipts.length) throw new NotFoundException('Goods receipt not found');
        if (receipts[0].reversedAt) throw new BadRequestException('Reversed goods receipt cannot enter return approval.');

        const receiptItems = await tx.$queryRawUnsafe<any[]>(
          `SELECT gri.id,gri.quantity,
                  COALESCE((
                    SELECT SUM(pri.quantity)
                    FROM inventory_purchase_return_items pri
                    JOIN inventory_purchase_returns pr ON pr.id=pri.purchase_return_id
                    WHERE pri.goods_receipt_item_id=gri.id
                      AND pr.tenant_id=$2::text AND pr.company_id=$3::text
                  ),0)::numeric AS "returnedQuantity",
                  COALESCE((
                    SELECT SUM((entry->>'quantity')::numeric)
                    FROM inventory_purchase_return_requests rr
                    CROSS JOIN LATERAL jsonb_array_elements(rr.items) entry
                    WHERE rr.goods_receipt_id=$1::text
                      AND rr.tenant_id=$2::text AND rr.company_id=$3::text
                      AND rr.status IN ('PENDING','APPROVED')
                      AND entry->>'goodsReceiptItemId'=gri.id
                  ),0)::numeric AS "reservedQuantity"
           FROM inventory_goods_receipt_items gri
           WHERE gri.goods_receipt_id=$1::text AND gri.id=ANY($4::text[])
           ORDER BY gri.id`,
          goodsReceiptId,
          tenantId,
          companyId,
          ids,
        );
        if (receiptItems.length !== input.items.length) {
          throw new BadRequestException('One or more return items do not belong to this goods receipt.');
        }

        const byId = new Map(receiptItems.map((item) => [item.id, item]));
        for (const requested of input.items) {
          const item = byId.get(requested.goodsReceiptItemId);
          const quantity = Number(requested.quantity);
          if (!item) throw new BadRequestException('Return item not found.');
          const available = Number(item.quantity) - Number(item.returnedQuantity) - Number(item.reservedQuantity);
          if (quantity > available) {
            throw new BadRequestException(`Return quantity exceeds unreserved returnable quantity for receipt item ${item.id}.`);
          }
        }

        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO inventory_purchase_return_requests(
             tenant_id,company_id,branch_id,goods_receipt_id,reason,items,requested_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6::jsonb,$7::text)
           RETURNING id,status,goods_receipt_id AS "goodsReceiptId",reason,items,created_at AS "createdAt"`,
          tenantId,
          companyId,
          receipts[0].branchId,
          goodsReceiptId,
          reason,
          JSON.stringify(input.items),
          userId,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED') {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,goods_receipt_id AS "goodsReceiptId",branch_id AS "branchId",reason,items,status,
              requested_by_user_id AS "requestedByUserId",approved_by_user_id AS "approvedByUserId",approved_at AS "approvedAt",
              rejected_by_user_id AS "rejectedByUserId",rejected_at AS "rejectedAt",rejection_reason AS "rejectionReason",
              executed_purchase_return_id AS "executedPurchaseReturnId",executed_at AS "executedAt",created_at AS "createdAt"
       FROM inventory_purchase_return_requests
       WHERE company_id=$1::text AND ($2::text IS NULL OR branch_id=$2::text)
         AND ($3::text IS NULL OR status::text=$3::text)
       ORDER BY created_at DESC`,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async approve(id: string, userId: string) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId" FROM inventory_purchase_return_requests
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Return request not found');
    if (rows[0].status !== 'PENDING') throw new BadRequestException('Only pending return requests can be approved.');
    await this.assertApprover(userId, rows[0].branchId);
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_return_requests
       SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND status='PENDING'`,
      id,
      userId,
    );
    if (updated !== 1) throw new BadRequestException('Return request changed concurrently.');
    return (await this.list()).find((item) => item.id === id);
  }

  async reject(id: string, userId: string, reason: string) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId" FROM inventory_purchase_return_requests
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Return request not found');
    if (rows[0].status !== 'PENDING') throw new BadRequestException('Only pending return requests can be rejected.');
    await this.assertApprover(userId, rows[0].branchId);
    const cleanReason = reason.trim();
    if (!cleanReason) throw new BadRequestException('Rejection reason is required.');
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_return_requests
       SET status='REJECTED',rejected_by_user_id=$2::text,rejected_at=NOW(),rejection_reason=$3,updated_at=NOW()
       WHERE id=$1::text AND status='PENDING'`,
      id,
      userId,
      cleanReason,
    );
    if (updated !== 1) throw new BadRequestException('Return request changed concurrently.');
    return (await this.list()).find((item) => item.id === id);
  }

  async execute(id: string) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,goods_receipt_id AS "goodsReceiptId",reason,items
       FROM inventory_purchase_return_requests
       WHERE id=$1::text AND company_id=$2::text AND ($3::text IS NULL OR branch_id=$3::text) LIMIT 1`,
      id,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Return request not found');
    const request = rows[0];
    if (request.status !== 'APPROVED') throw new BadRequestException('Only approved return requests can be executed.');
    const result = await this.returns.partialReturn(request.goodsReceiptId, {
      reason: request.reason,
      items: request.items,
    });
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_purchase_return_requests
       SET status='EXECUTED',executed_purchase_return_id=$2::text,executed_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND status='APPROVED'`,
      id,
      result.purchaseReturnId,
    );
    if (updated !== 1) throw new BadRequestException('Return request changed concurrently after execution.');
    return { requestId: id, ...result };
  }
}
