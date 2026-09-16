import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { InventoryScopeService } from './inventory-scope.service';

export type InventoryReportingInput = Readonly<{ from: Date; to: Date }>;

@Injectable()
export class InventoryReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryScope: InventoryScopeService,
  ) {}

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

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      movementType: row.movementType,
      movementCount: Number(row.movementCount),
      quantity: Number(row.quantity ?? 0),
      movementValue: Number(row.movementValue ?? 0),
    }));
  }
}
