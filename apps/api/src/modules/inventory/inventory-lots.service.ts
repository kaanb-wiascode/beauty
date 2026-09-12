import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface InventoryLotListInput {
  productId?: string;
  warehouseId?: string;
  expiringWithinDays?: number;
}

export interface CreateInventoryLotInput {
  productId: string;
  warehouseId: string;
  lotNumber: string;
  manufacturedAt?: Date | null;
  expiresAt?: Date | null;
  quantity: number;
  unitCost?: number;
  note?: string | null;
}

@Injectable()
export class InventoryLotsService {
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

  async list(input: InventoryLotListInput = {}) {
    const { companyId, branchId } = this.context();
    const expiringWithinDays = input.expiringWithinDays ?? null;

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,
              l.product_id AS "productId",
              p.name AS "productName",
              p.sku,
              p.unit,
              l.warehouse_id AS "warehouseId",
              w.name AS "warehouseName",
              w.branch_id AS "branchId",
              l.lot_number AS "lotNumber",
              l.manufactured_at AS "manufacturedAt",
              l.expires_at AS "expiresAt",
              l.quantity,
              l.unit_cost AS "unitCost",
              l.created_at AS "createdAt"
       FROM inventory_product_lots l
       JOIN inventory_products p
         ON p.id=l.product_id AND p.company_id=l.company_id
       JOIN inventory_warehouses w
         ON w.id=l.warehouse_id AND w.company_id=l.company_id
       WHERE l.company_id=$1::text
         AND ($2::text IS NULL OR w.branch_id=$2::text)
         AND ($3::text IS NULL OR l.product_id=$3::text)
         AND ($4::text IS NULL OR l.warehouse_id=$4::text)
         AND (
           $5::int IS NULL
           OR (
             l.expires_at IS NOT NULL
             AND l.expires_at <= NOW()+make_interval(days => $5::int)
           )
         )
       ORDER BY l.expires_at ASC NULLS LAST,l.created_at DESC`,
      companyId,
      branchId,
      input.productId ?? null,
      input.warehouseId ?? null,
      expiringWithinDays,
    );
  }

  async create(input: CreateInventoryLotInput) {
    const { tenantId, companyId, branchId } = this.context();
    const quantity = Number(input.quantity);
    const unitCost = Number(input.unitCost ?? 0);
    const lotNumber = input.lotNumber.trim();

    if (!lotNumber) {
      throw new BadRequestException('Lot number is required.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Lot quantity must be greater than zero.');
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new BadRequestException('Lot unit cost cannot be negative.');
    }
    if (
      input.manufacturedAt &&
      input.expiresAt &&
      input.manufacturedAt > input.expiresAt
    ) {
      throw new BadRequestException(
        'Manufactured date cannot be after expiry date.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const warehouses = await tx.$queryRawUnsafe<
          Array<{ id: string; branchId: string | null }>
        >(
          `SELECT id,branch_id AS "branchId"
           FROM inventory_warehouses
           WHERE id=$1::text
             AND company_id=$2::text
             AND status='ACTIVE'
             AND ($3::text IS NULL OR branch_id=$3::text)
           LIMIT 1`,
          input.warehouseId,
          companyId,
          branchId,
        );
        if (!warehouses.length) {
          throw new BadRequestException(
            'Warehouse is outside the active branch scope.',
          );
        }

        const products = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id
           FROM inventory_products
           WHERE id=$1::text
             AND company_id=$2::text
             AND status='ACTIVE'
           LIMIT 1`,
          input.productId,
          companyId,
        );
        if (!products.length) {
          throw new NotFoundException('Product not found');
        }

        const lots = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO inventory_product_lots(
             tenant_id,company_id,product_id,warehouse_id,lot_number,
             manufactured_at,expires_at,quantity,unit_cost
           )
           VALUES(
             $1::text,$2::text,$3::text,$4::text,$5,
             $6::timestamptz,$7::timestamptz,$8,$9
           )
           ON CONFLICT(product_id,warehouse_id,lot_number) DO NOTHING
           RETURNING id,
                     product_id AS "productId",
                     warehouse_id AS "warehouseId",
                     lot_number AS "lotNumber",
                     manufactured_at AS "manufacturedAt",
                     expires_at AS "expiresAt",
                     quantity,
                     unit_cost AS "unitCost",
                     created_at AS "createdAt"`,
          tenantId,
          companyId,
          input.productId,
          input.warehouseId,
          lotNumber,
          input.manufacturedAt ?? null,
          input.expiresAt ?? null,
          quantity,
          unitCost,
        );
        if (!lots.length) {
          throw new ConflictException(
            'Lot already exists for this product and warehouse.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(
             product_id,warehouse_id,quantity,cost_per_unit
           ) VALUES($1::text,$2::text,$3,$4)
           ON CONFLICT(product_id,warehouse_id)
           DO UPDATE SET
             cost_per_unit=CASE
               WHEN inventory_stock.quantity+EXCLUDED.quantity > 0
               THEN ROUND((
                 inventory_stock.quantity*inventory_stock.cost_per_unit +
                 EXCLUDED.quantity*EXCLUDED.cost_per_unit
               )/(inventory_stock.quantity+EXCLUDED.quantity),2)
               ELSE EXCLUDED.cost_per_unit
             END,
             quantity=inventory_stock.quantity+EXCLUDED.quantity,
             updated_at=NOW()`,
          input.productId,
          input.warehouseId,
          quantity,
          unitCost,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(
             tenant_id,company_id,product_id,warehouse_id,type,quantity,
             unit_cost,reference_type,reference_id,note
           ) VALUES(
             $1::text,$2::text,$3::text,$4::text,'ADJUSTMENT_IN',$5,
             $6,'LOT',$7::text,$8
           )`,
          tenantId,
          companyId,
          input.productId,
          input.warehouseId,
          quantity,
          unitCost,
          lots[0].id,
          input.note?.trim() || `Lot Girişi: ${lotNumber}`,
        );

        return lots[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
