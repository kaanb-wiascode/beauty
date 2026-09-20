import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { InventoryScopeService } from './inventory-scope.service';

export type InventoryReportingInput = Readonly<{ from: Date; to: Date }>;

export type InventoryMovementDetailInput = InventoryReportingInput &
  Readonly<{ movementType: string }>;

@Injectable()
export class InventoryReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryScope: InventoryScopeService,
  ) {}

  async movementDetails(input: InventoryMovementDetailInput) {
    const { tenantId, companyId, branchIds } =
      await this.inventoryScope.getWarehouseScope();

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        createdAt: Date;
        movementType: string;
        productName: string;
        sku: string | null;
        warehouseName: string;
        quantity: unknown;
        unitCost: unknown;
        movementValue: unknown;
        referenceType: string | null;
      }>
    >(
      `SELECT m.id,m.created_at AS "createdAt",m.type::text AS "movementType",
              p.name AS "productName",p.sku,w.name AS "warehouseName",
              m.quantity,COALESCE(m.unit_cost,0)::numeric AS "unitCost",
              (m.quantity*COALESCE(m.unit_cost,0))::numeric AS "movementValue",
              m.reference_type AS "referenceType"
       FROM inventory_movements m
       JOIN inventory_warehouses w ON w.id=m.warehouse_id
       JOIN inventory_products p ON p.id=m.product_id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text
         AND ($3::text[] IS NULL OR w.branch_id=ANY($3::text[]))
         AND m.type::text=$4::text
         AND m.created_at >= $5::timestamptz
         AND m.created_at <= $6::timestamptz
       ORDER BY m.created_at DESC,m.id DESC`,
      tenantId,
      companyId,
      branchIds,
      input.movementType,
      input.from,
      input.to,
    );

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      movementType: row.movementType,
      productName: row.productName,
      sku: row.sku,
      warehouseName: row.warehouseName,
      quantity: Number(row.quantity ?? 0),
      unitCost: Number(row.unitCost ?? 0),
      movementValue: Number(row.movementValue ?? 0),
      referenceType: row.referenceType,
    }));
  }

  async performance(input: InventoryReportingInput) {
    const { tenantId, companyId, branchIds } = await this.inventoryScope.getWarehouseScope();

    const rows = await this.prisma.$queryRawUnsafe<Array<{
      date: Date;
      movementType: string;
      movementCount: number;
      quantity: unknown;
      movementValue: unknown;
    }>>(
      `SELECT date_trunc('day',m.created_at) AS date,
              m.type::text AS "movementType",
              COUNT(*)::int AS "movementCount",
              COALESCE(SUM(m.quantity),0)::numeric AS quantity,
              COALESCE(SUM(m.quantity*COALESCE(m.unit_cost,0)),0)::numeric AS "movementValue"
       FROM inventory_movements m
       JOIN inventory_warehouses w ON w.id=m.warehouse_id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text
         AND ($3::text[] IS NULL OR w.branch_id=ANY($3::text[]))
         AND m.created_at >= $4::timestamptz
         AND m.created_at <= $5::timestamptz
       GROUP BY date_trunc('day',m.created_at),m.type
       ORDER BY date ASC,m.type ASC`,
      tenantId,
      companyId,
      branchIds,
      input.from,
      input.to,
    );

    return rows.map((row) => {
      const date = row.date.toISOString().slice(0, 10);
      return {
        id: `${date}|${row.movementType}`,
        date,
        movementType: row.movementType,
      movementCount: Number(row.movementCount),
      quantity: Number(row.quantity ?? 0),
        movementValue: Number(row.movementValue ?? 0),
      };
    });
  }
}
