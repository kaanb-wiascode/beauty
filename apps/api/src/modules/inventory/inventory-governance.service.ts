import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type CycleCountInput = {
  warehouseId: string;
  reason: string;
  userId: string;
  items: Array<{ productId: string; countedQuantity: number }>;
};

@Injectable()
export class InventoryGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private normalizeRole(value: string | null | undefined) {
    return (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private journalNumber(date: Date) {
    return `JE-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async assertApprover(userId: string, branchId: string | null) {
    const { tenantId, companyId, branchId: activeBranchId } = this.context();
    if (activeBranchId && branchId && activeBranchId !== branchId) {
      throw new ForbiddenException('Operation is outside active branch scope.');
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
      throw new ForbiddenException('Approver has no access to operation branch.');
    }
    const identities = new Set([this.normalizeRole(actor.roleSlug), this.normalizeRole(actor.roleName)]);
    const allowed = ['manager','branch-manager','company-manager','general-manager','finance','finance-manager','finance-director','cfo','director','owner','admin','super-admin'];
    if (!allowed.some((role) => identities.has(role))) {
      throw new ForbiddenException('Inventory approval requires manager or higher authority.');
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
    const existing = await tx.chartOfAccount.findFirst({ where: { tenantId, companyId, code }, select: { id: true, active: true } });
    if (existing) {
      if (!existing.active) return tx.chartOfAccount.update({ where: { id: existing.id }, data: { active: true }, select: { id: true } });
      return existing;
    }
    return tx.chartOfAccount.create({ data: { tenantId, companyId, code, name, type, active: true }, select: { id: true } });
  }

  async approveTransfer(id: string, userId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const transfer = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id,t.status,sw.branch_id AS "sourceBranchId",dw.branch_id AS "destinationBranchId"
       FROM inventory_transfers t
       JOIN inventory_warehouses sw ON sw.id=t.source_warehouse_id
       JOIN inventory_warehouses dw ON dw.id=t.destination_warehouse_id
       WHERE t.id=$1::text AND t.tenant_id=$2::text AND t.company_id=$3::text
         AND ($4::text IS NULL OR sw.branch_id=$4::text OR dw.branch_id=$4::text)
       LIMIT 1`,
      id, tenantId, companyId, branchId,
    );
    if (!transfer.length) throw new NotFoundException('Transfer not found.');
    if (transfer[0].status !== 'PENDING') throw new BadRequestException('Only pending transfers can be approved.');
    await this.assertApprover(userId, transfer[0].sourceBranchId ?? transfer[0].destinationBranchId ?? null);
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_transfers SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status='PENDING'`,
      id, userId, tenantId, companyId,
    );
    if (updated !== 1) throw new BadRequestException('Transfer changed concurrently.');
    return { transferId: id, status: 'APPROVED' };
  }

  async dispatchTransfer(id: string, userId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT t.id,t.status,t.source_warehouse_id AS "sourceWarehouseId",t.destination_warehouse_id AS "destinationWarehouseId",
                sw.branch_id AS "sourceBranchId",dw.branch_id AS "destinationBranchId"
         FROM inventory_transfers t
         JOIN inventory_warehouses sw ON sw.id=t.source_warehouse_id
         JOIN inventory_warehouses dw ON dw.id=t.destination_warehouse_id
         WHERE t.id=$1::text AND t.tenant_id=$2::text AND t.company_id=$3::text
           AND ($4::text IS NULL OR sw.branch_id=$4::text OR dw.branch_id=$4::text)
         FOR UPDATE`,
        id, tenantId, companyId, branchId,
      );
      if (!rows.length) throw new NotFoundException('Transfer not found.');
      const transfer = rows[0];
      if (transfer.status !== 'APPROVED') throw new BadRequestException('Only approved transfers can be dispatched.');

      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.id,i.product_id AS "productId",i.quantity,i.dispatched_quantity AS "dispatchedQuantity"
         FROM inventory_transfer_items i
         JOIN inventory_products p ON p.id=i.product_id AND p.company_id=$2::text
         WHERE i.transfer_id=$1::text ORDER BY i.id FOR UPDATE`,
        id, companyId,
      );
      if (!items.length) throw new BadRequestException('Transfer has no items.');
      let totalValue = 0;
      for (const item of items) {
        if (Number(item.dispatchedQuantity) !== 0) throw new BadRequestException('Transfer item has already been dispatched.');
        const stock = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, transfer.sourceWarehouseId,
        );
        if (!stock.length || Number(stock[0].quantity) < Number(item.quantity)) {
          throw new BadRequestException(`Insufficient source stock for product ${item.productId}.`);
        }
        const quantity = Number(item.quantity);
        const unitCost = Number(stock[0].costPerUnit ?? 0);
        const lineValue = this.round(quantity * unitCost);
        totalValue = this.round(totalValue + lineValue);
        await tx.$executeRawUnsafe(
          `UPDATE inventory_stock SET quantity=quantity-$3,updated_at=NOW()
           WHERE product_id=$1::text AND warehouse_id=$2::text`,
          item.productId, transfer.sourceWarehouseId, quantity,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id)
           VALUES($1::text,$2::text,$3::text,$4::text,'TRANSFER_OUT',$5,$6,'WAREHOUSE_TRANSFER',$7::text,'Transfer sevk edildi',$8::text)`,
          tenantId, companyId, item.productId, transfer.sourceWarehouseId, quantity, unitCost, id, userId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_transfer_items
           SET unit_cost_snapshot=$2,line_value=$3,dispatched_quantity=quantity
           WHERE id=$1::text`,
          item.id, unitCost, lineValue,
        );
      }
      const updated = await tx.$executeRawUnsafe(
        `UPDATE inventory_transfers
         SET status='IN_TRANSIT',dispatched_by_user_id=$2::text,dispatched_at=NOW(),executed_at=NOW(),total_value=$3,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text AND status='APPROVED'`,
        id, userId, totalValue, tenantId, companyId,
      );
      if (updated !== 1) throw new BadRequestException('Transfer changed concurrently.');
      return { transferId: id, status: 'IN_TRANSIT', totalValue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createCycleCount(input: CycleCountInput) {
    const { tenantId, companyId, branchId } = this.context();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Cycle count reason is required.');
    if (!input.items.length) throw new BadRequestException('Cycle count must contain at least one item.');
    const ids = input.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A product can only appear once in a cycle count.');

    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId" FROM inventory_warehouses
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE'
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        input.warehouseId, tenantId, companyId, branchId,
      );
      if (!warehouses.length) throw new NotFoundException('Warehouse not found.');
      const countId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_cycle_counts(id,tenant_id,company_id,branch_id,warehouse_id,status,reason,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'DRAFT',$6,$7::text)`,
        countId, tenantId, companyId, warehouses[0].branchId, input.warehouseId, reason, input.userId,
      );
      for (const item of input.items) {
        const counted = Number(item.countedQuantity);
        if (!Number.isFinite(counted) || counted < 0) throw new BadRequestException('Counted quantity cannot be negative.');
        const stock = await tx.$queryRawUnsafe<any[]>(
          `SELECT p.id,COALESCE(s.quantity,0)::numeric AS quantity,COALESCE(s.cost_per_unit,0)::numeric AS "costPerUnit"
           FROM inventory_products p
           LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id=$3::text
           WHERE p.id=$1::text AND p.company_id=$2::text AND p.status='ACTIVE' LIMIT 1`,
          item.productId, companyId, input.warehouseId,
        );
        if (!stock.length) throw new NotFoundException(`Product ${item.productId} not found.`);
        const expected = Number(stock[0].quantity ?? 0);
        const unitCost = Number(stock[0].costPerUnit ?? 0);
        const variance = counted - expected;
        const varianceValue = this.round(Math.abs(variance) * unitCost);
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_cycle_count_items(id,cycle_count_id,product_id,expected_quantity,counted_quantity,variance_quantity,unit_cost_snapshot,variance_value)
           VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8)`,
          randomUUID(), countId, item.productId, expected, counted, variance, unitCost, varianceValue,
        );
      }
      return this.getCycleCount(countId, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async getCycleCount(id: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT cc.id,cc.warehouse_id AS "warehouseId",cc.branch_id AS "branchId",cc.status,cc.reason,
              cc.total_variance_value AS "totalVarianceValue",cc.submitted_at AS "submittedAt",
              cc.approved_at AS "approvedAt",cc.posted_at AS "postedAt",cc.created_at AS "createdAt"
       FROM inventory_cycle_counts cc
       WHERE cc.id=$1::text AND cc.tenant_id=$2::text AND cc.company_id=$3::text
         AND ($4::text IS NULL OR cc.branch_id=$4::text) LIMIT 1`,
      id, tenantId, companyId, branchId,
    );
    if (!rows.length) throw new NotFoundException('Cycle count not found.');
    return rows[0];
  }

  async listCycleCounts(status?: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT cc.id,cc.warehouse_id AS "warehouseId",w.name AS "warehouseName",cc.branch_id AS "branchId",cc.status,cc.reason,
              cc.total_variance_value AS "totalVarianceValue",cc.created_at AS "createdAt",cc.posted_at AS "postedAt",
              COUNT(i.id)::int AS "itemCount"
       FROM inventory_cycle_counts cc
       JOIN inventory_warehouses w ON w.id=cc.warehouse_id
       LEFT JOIN inventory_cycle_count_items i ON i.cycle_count_id=cc.id
       WHERE cc.tenant_id=$1::text AND cc.company_id=$2::text
         AND ($3::text IS NULL OR cc.branch_id=$3::text)
         AND ($4::text IS NULL OR cc.status=$4::text)
       GROUP BY cc.id,w.name ORDER BY cc.created_at DESC`,
      tenantId, companyId, branchId, status ?? null,
    );
  }

  async submitCycleCount(id: string, userId: string) {
    const { tenantId, companyId } = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_cycle_counts SET status='SUBMITTED',submitted_by_user_id=$2::text,submitted_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status='DRAFT'`,
      id, userId, tenantId, companyId,
    );
    if (updated !== 1) throw new BadRequestException('Only draft cycle counts can be submitted.');
    return this.getCycleCount(id);
  }

  async approveCycleCount(id: string, userId: string) {
    const count = await this.getCycleCount(id);
    if (count.status !== 'SUBMITTED') throw new BadRequestException('Only submitted cycle counts can be approved.');
    await this.assertApprover(userId, count.branchId ?? null);
    const { tenantId, companyId } = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_cycle_counts SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status='SUBMITTED'`,
      id, userId, tenantId, companyId,
    );
    if (updated !== 1) throw new BadRequestException('Cycle count changed concurrently.');
    return this.getCycleCount(id);
  }

  async rejectCycleCount(id: string, userId: string, reason: string) {
    const count = await this.getCycleCount(id);
    if (count.status !== 'SUBMITTED') throw new BadRequestException('Only submitted cycle counts can be rejected.');
    await this.assertApprover(userId, count.branchId ?? null);
    const clean = reason.trim();
    if (!clean) throw new BadRequestException('Rejection reason is required.');
    const { tenantId, companyId } = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE inventory_cycle_counts
       SET status='REJECTED',rejected_by_user_id=$2::text,rejected_at=NOW(),rejection_reason=$3,updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text AND status='SUBMITTED'`,
      id, userId, clean, tenantId, companyId,
    );
    if (updated !== 1) throw new BadRequestException('Cycle count changed concurrently.');
    return this.getCycleCount(id);
  }

  async postCycleCount(id: string, userId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const counts = await tx.$queryRawUnsafe<any[]>(
        `SELECT cc.id,cc.status,cc.warehouse_id AS "warehouseId",cc.branch_id AS "branchId",cc.reason
         FROM inventory_cycle_counts cc
         WHERE cc.id=$1::text AND cc.tenant_id=$2::text AND cc.company_id=$3::text
           AND ($4::text IS NULL OR cc.branch_id=$4::text) FOR UPDATE`,
        id, tenantId, companyId, branchId,
      );
      if (!counts.length) throw new NotFoundException('Cycle count not found.');
      const count = counts[0];
      if (count.status !== 'APPROVED') throw new BadRequestException('Only approved cycle counts can be posted.');
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,product_id AS "productId",expected_quantity AS "expectedQuantity",counted_quantity AS "countedQuantity",
                variance_quantity AS "varianceQuantity",unit_cost_snapshot AS "unitCost",variance_value AS "varianceValue"
         FROM inventory_cycle_count_items WHERE cycle_count_id=$1::text ORDER BY id FOR UPDATE`, id,
      );
      let totalVarianceValue = 0;
      let positiveValue = 0;
      let negativeValue = 0;
      for (const item of items) {
        const current = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity FROM inventory_stock WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, count.warehouseId,
        );
        const currentQty = Number(current[0]?.quantity ?? 0);
        if (Math.abs(currentQty - Number(item.expectedQuantity)) > 0.0005) {
          throw new BadRequestException(`Stock changed after count snapshot for product ${item.productId}. Recount is required.`);
        }
        const variance = Number(item.varianceQuantity);
        const value = Number(item.varianceValue);
        totalVarianceValue = this.round(totalVarianceValue + value);
        if (variance > 0) positiveValue = this.round(positiveValue + value);
        if (variance < 0) negativeValue = this.round(negativeValue + value);
        if (variance === 0) continue;
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
           VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=NOW()`,
          item.productId, count.warehouseId, Number(item.countedQuantity), Number(item.unitCost),
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::"InventoryMovementType",$6,$7,'CYCLE_COUNT',$8::text,$9,$10::text)`,
          tenantId, companyId, item.productId, count.warehouseId,
          variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT', Math.abs(variance), Number(item.unitCost), id, count.reason, userId,
        );
      }

      if (positiveValue > 0 || negativeValue > 0) {
        const inventory = await this.ensureAccount(tx, tenantId, companyId, '150', 'İlk Madde ve Malzeme', 'ASSET');
        const gain = positiveValue > 0 ? await this.ensureAccount(tx, tenantId, companyId, '679', 'Diğer Olağandışı Gelir ve Karlar', 'REVENUE') : null;
        const loss = negativeValue > 0 ? await this.ensureAccount(tx, tenantId, companyId, '689', 'Diğer Olağandışı Gider ve Zararlar', 'EXPENSE') : null;
        const now = new Date();
        const lines: Array<{ accountId: string; debit: number; credit: number; memo?: string }> = [];
        if (positiveValue > 0 && gain) {
          lines.push({ accountId: inventory.id, debit: positiveValue, credit: 0, memo: 'Sayım fazlası' });
          lines.push({ accountId: gain.id, debit: 0, credit: positiveValue, memo: 'Sayım fazlası' });
        }
        if (negativeValue > 0 && loss) {
          lines.push({ accountId: loss.id, debit: negativeValue, credit: 0, memo: 'Sayım eksiği' });
          lines.push({ accountId: inventory.id, debit: 0, credit: negativeValue, memo: 'Sayım eksiği' });
        }
        await tx.journalEntry.create({
          data: {
            tenantId, companyId, branchId: count.branchId, number: this.journalNumber(now), status: 'POSTED', entryDate: now,
            description: `Cycle count ${id}`, referenceType: 'CYCLE_COUNT', referenceId: id, postedAt: now,
            lines: { create: lines },
          },
        });
      }

      const updated = await tx.$executeRawUnsafe(
        `UPDATE inventory_cycle_counts
         SET status='POSTED',posted_by_user_id=$2::text,posted_at=NOW(),total_variance_value=$3,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text AND status='APPROVED'`,
        id, userId, totalVarianceValue, tenantId, companyId,
      );
      if (updated !== 1) throw new BadRequestException('Cycle count changed concurrently.');
      return { cycleCountId: id, status: 'POSTED', totalVarianceValue, positiveValue, negativeValue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
