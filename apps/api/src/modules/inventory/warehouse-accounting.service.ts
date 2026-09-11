import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type WarehouseAdjustmentInput = {
  warehouseId: string;
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRED';
  reason: string;
  userId?: string;
  items: Array<{ productId: string; quantity: number; unitCost?: number }>;
};

@Injectable()
export class WarehouseAccountingService {
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

  private round(value: number) {
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
    const existing = await tx.chartOfAccount.findFirst({ where: { tenantId, companyId, code }, select: { id: true, active: true } });
    if (existing) {
      if (!existing.active) return tx.chartOfAccount.update({ where: { id: existing.id }, data: { active: true }, select: { id: true } });
      return existing;
    }
    return tx.chartOfAccount.create({ data: { tenantId, companyId, code, name, type, active: true }, select: { id: true } });
  }

  async receiveTransfer(id: string) {
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
      if (transfer.status === 'RECEIVED') throw new BadRequestException('Transfer has already been received.');
      if (!['PENDING', 'APPROVED', 'IN_TRANSIT'].includes(transfer.status)) {
        throw new BadRequestException('Transfer is not ready to be received.');
      }

      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.id,i.product_id AS "productId",i.quantity
         FROM inventory_transfer_items i
         JOIN inventory_products p ON p.id=i.product_id AND p.company_id=$2::text
         WHERE i.transfer_id=$1::text
         ORDER BY i.id FOR UPDATE`,
        id, companyId,
      );
      if (!items.length) throw new BadRequestException('Transfer has no items.');

      let totalValue = 0;
      for (const item of items) {
        const sourceRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, transfer.sourceWarehouseId,
        );
        if (!sourceRows.length) throw new BadRequestException(`Source stock not found for product ${item.productId}.`);
        const quantity = Number(item.quantity);
        const available = Number(sourceRows[0].quantity);
        const unitCost = Number(sourceRows[0].costPerUnit ?? 0);
        if (available < quantity) throw new BadRequestException(`Insufficient source stock for product ${item.productId}.`);
        const lineValue = this.round(quantity * unitCost);
        totalValue = this.round(totalValue + lineValue);

        const destinationRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, transfer.destinationWarehouseId,
        );
        const destinationQty = Number(destinationRows[0]?.quantity ?? 0);
        const destinationCost = Number(destinationRows[0]?.costPerUnit ?? 0);
        const newQty = destinationQty + quantity;
        const weightedCost = newQty > 0
          ? this.round((destinationQty * destinationCost + quantity * unitCost) / newQty)
          : unitCost;

        await tx.$executeRawUnsafe(
          `UPDATE inventory_stock SET quantity=quantity-$3,updated_at=NOW()
           WHERE product_id=$1::text AND warehouse_id=$2::text`,
          item.productId, transfer.sourceWarehouseId, quantity,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
           VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET quantity=inventory_stock.quantity+EXCLUDED.quantity,cost_per_unit=$4,updated_at=NOW()`,
          item.productId, transfer.destinationWarehouseId, quantity, weightedCost,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note)
           VALUES
             ($1::text,$2::text,$3::text,$4::text,'TRANSFER_OUT',$6,$7,'WAREHOUSE_TRANSFER',$8::text,'Depolar arası transfer çıkışı'),
             ($1::text,$2::text,$3::text,$5::text,'TRANSFER_IN',$6,$7,'WAREHOUSE_TRANSFER',$8::text,'Depolar arası transfer girişi')`,
          tenantId, companyId, item.productId, transfer.sourceWarehouseId, transfer.destinationWarehouseId, quantity, unitCost, id,
        );
        await tx.$executeRawUnsafe(
          `UPDATE inventory_transfer_items SET unit_cost_snapshot=$2,line_value=$3 WHERE id=$1::text`,
          item.id, unitCost, lineValue,
        );
      }

      const updated = await tx.$executeRawUnsafe(
        `UPDATE inventory_transfers
         SET status='RECEIVED',executed_at=COALESCE(executed_at,NOW()),received_at=NOW(),total_value=$2,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status<>'RECEIVED'`,
        id, totalValue, tenantId, companyId,
      );
      if (updated !== 1) throw new BadRequestException('Transfer changed concurrently.');
      return { transferId: id, status: 'RECEIVED', totalValue };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async postAdjustment(input: WarehouseAdjustmentInput) {
    const { tenantId, companyId, branchId } = this.context();
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('Adjustment reason is required.');
    if (!input.items?.length) throw new BadRequestException('Adjustment must contain at least one item.');
    const ids = input.items.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A product can only appear once in an adjustment.');

    return this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId" FROM inventory_warehouses
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='ACTIVE'
           AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        input.warehouseId, tenantId, companyId, branchId,
      );
      if (!warehouses.length) throw new NotFoundException('Warehouse not found.');
      const warehouse = warehouses[0];
      const outbound = input.type !== 'ADJUSTMENT_IN';
      let totalValue = 0;
      const prepared: Array<{ productId: string; quantity: number; unitCost: number; lineValue: number }> = [];

      for (const item of input.items) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Adjustment quantities must be greater than zero.');
        const product = await tx.$queryRawUnsafe<any[]>(
          `SELECT p.id,s.quantity,s.cost_per_unit AS "costPerUnit"
           FROM inventory_products p
           LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id=$3::text
           WHERE p.id=$1::text AND p.company_id=$2::text AND p.status='ACTIVE' LIMIT 1 FOR UPDATE OF p`,
          item.productId, companyId, input.warehouseId,
        );
        if (!product.length) throw new NotFoundException(`Product ${item.productId} not found.`);
        const currentQty = Number(product[0].quantity ?? 0);
        if (outbound && currentQty < quantity) throw new BadRequestException(`Insufficient stock for product ${item.productId}.`);
        const unitCost = outbound
          ? Number(product[0].costPerUnit ?? 0)
          : Number(item.unitCost ?? product[0].costPerUnit ?? 0);
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestException('Unit cost cannot be negative.');
        const lineValue = this.round(quantity * unitCost);
        totalValue = this.round(totalValue + lineValue);
        prepared.push({ productId: item.productId, quantity, unitCost, lineValue });
      }

      const adjustmentId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_stock_adjustments(id,tenant_id,company_id,branch_id,warehouse_id,type,reason,total_value,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9::text)`,
        adjustmentId, tenantId, companyId, warehouse.branchId, input.warehouseId, input.type, reason, totalValue, input.userId ?? null,
      );

      for (const item of prepared) {
        const stock = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity,cost_per_unit AS "costPerUnit" FROM inventory_stock
           WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          item.productId, input.warehouseId,
        );
        const oldQty = Number(stock[0]?.quantity ?? 0);
        const oldCost = Number(stock[0]?.costPerUnit ?? 0);
        const delta = outbound ? -item.quantity : item.quantity;
        const newQty = oldQty + delta;
        const newCost = outbound || newQty <= 0
          ? oldCost
          : this.round((oldQty * oldCost + item.quantity * item.unitCost) / newQty);
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,cost_per_unit)
           VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET quantity=inventory_stock.quantity+$3,cost_per_unit=$4,updated_at=NOW()`,
          item.productId, input.warehouseId, delta, newCost,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock_adjustment_items(adjustment_id,product_id,quantity,unit_cost,line_value)
           VALUES($1::text,$2::text,$3,$4,$5)`,
          adjustmentId, item.productId, item.quantity, item.unitCost, item.lineValue,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_type,reference_id,note)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::"InventoryMovementType",$6,$7,'STOCK_ADJUSTMENT',$8::text,$9)`,
          tenantId, companyId, item.productId, input.warehouseId, input.type, item.quantity, item.unitCost, adjustmentId, reason,
        );
      }

      if (totalValue > 0) {
        const inventory = await this.ensureAccount(tx, tenantId, companyId, '150', 'İlk Madde ve Malzeme', 'ASSET');
        const variance = outbound
          ? await this.ensureAccount(tx, tenantId, companyId, '689', 'Diğer Olağandışı Gider ve Zararlar', 'EXPENSE')
          : await this.ensureAccount(tx, tenantId, companyId, '679', 'Diğer Olağandışı Gelir ve Karlar', 'REVENUE');
        const now = new Date();
        await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId: warehouse.branchId,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Stok düzeltmesi ${adjustmentId}`,
            referenceType: 'STOCK_ADJUSTMENT',
            referenceId: adjustmentId,
            postedAt: now,
            lines: {
              create: outbound
                ? [
                    { accountId: variance.id, debit: totalValue, credit: 0, memo: input.type },
                    { accountId: inventory.id, debit: 0, credit: totalValue, memo: 'Stok değer düşüşü' },
                  ]
                : [
                    { accountId: inventory.id, debit: totalValue, credit: 0, memo: 'Stok değer artışı' },
                    { accountId: variance.id, debit: 0, credit: totalValue, memo: input.type },
                  ],
            },
          },
        });
      }

      return { adjustmentId, type: input.type, totalValue, status: 'POSTED' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async valuation() {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT w.id AS "warehouseId",w.name AS "warehouseName",w.type AS "warehouseType",w.branch_id AS "branchId",
              COUNT(DISTINCT s.product_id)::int AS "productCount",
              COALESCE(SUM(s.quantity),0)::numeric AS quantity,
              COALESCE(SUM(s.quantity*s.cost_per_unit),0)::numeric AS "inventoryValue"
       FROM inventory_warehouses w
       LEFT JOIN inventory_stock s ON s.warehouse_id=w.id
       WHERE w.tenant_id=$1::text AND w.company_id=$2::text AND w.status='ACTIVE'
         AND ($3::text IS NULL OR w.branch_id=$3::text)
       GROUP BY w.id
       ORDER BY w.type,w.name`,
      tenantId, companyId, branchId,
    );
  }

  async reconciliation() {
    const { tenantId, companyId, branchId } = this.context();
    const [valuationRows, glRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(s.quantity*s.cost_per_unit),0)::numeric AS value
         FROM inventory_stock s
         JOIN inventory_warehouses w ON w.id=s.warehouse_id
         WHERE w.tenant_id=$1::text AND w.company_id=$2::text AND w.status='ACTIVE'
           AND ($3::text IS NULL OR w.branch_id=$3::text)`,
        tenantId, companyId, branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS value
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId"
         JOIN chart_of_accounts coa ON coa.id=jel."accountId"
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text AND je.status='POSTED' AND coa.code='150'
           AND ($3::text IS NULL OR je."branchId"=$3::text)`,
        tenantId, companyId, branchId,
      ),
    ]);
    const subledgerValue = this.round(Number(valuationRows[0]?.value ?? 0));
    const glBalance = this.round(Number(glRows[0]?.value ?? 0));
    return {
      subledgerValue,
      glBalance,
      variance: this.round(subledgerValue - glBalance),
      reconciled: Math.abs(subledgerValue - glBalance) <= 0.01,
      scope: branchId ? 'BRANCH' : 'COMPANY',
      note: branchId
        ? 'Branch GL comparison uses journal branch attribution; intra-company warehouse transfers do not change company 150 balance.'
        : 'Company-level 150 inventory control account is reconciled to warehouse stock valuation.',
    };
  }
}
