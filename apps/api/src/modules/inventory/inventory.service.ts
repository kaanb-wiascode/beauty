import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

const row = (value: any) => value;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private tenantId() {
    const id = this.tenantContext.getTenantId();
    if (!id) throw new BadRequestException('Tenant context is missing');
    return id;
  }
  private companyId() {
    const id = this.tenantContext.getCompanyId();
    if (!id) throw new BadRequestException('Company context is missing');
    return id;
  }

  private async ensureWarehouses() {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO inventory_warehouses (tenant_id, company_id, name, type)
      VALUES ($1::uuid, $2::uuid, 'Ana Depo', 'MAIN_DEPOT')
      ON CONFLICT DO NOTHING
    `, tenantId, companyId);

    if (branchId) {
      const branch = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM branches WHERE id = $1::uuid AND company_id = $2::uuid AND status = 'ACTIVE' LIMIT 1`, branchId, companyId);
      if (!branch.length) throw new NotFoundException('Branch not found');
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO inventory_warehouses (tenant_id, company_id, branch_id, name, type)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'BRANCH')
        ON CONFLICT DO NOTHING
      `, tenantId, companyId, branchId, `${branch[0].name} Stok`);
    }
  }

  async overview() {
    await this.ensureWarehouses();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const warehouseFilter = branchId ? `w.branch_id = '${branchId}'::uuid` : `w.company_id = '${companyId}'::uuid`;

    const [metrics, critical, warehouses, purchases] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT p.id)::int AS "totalProducts",
               COUNT(DISTINCT CASE WHEN s.quantity <= s.minimum_quantity AND s.minimum_quantity > 0 THEN p.id END)::int AS "criticalProducts",
               COALESCE(SUM(s.quantity * s.cost_per_unit),0)::numeric AS "inventoryValue"
        FROM inventory_products p
        LEFT JOIN inventory_stock s ON s.product_id = p.id
        LEFT JOIN inventory_warehouses w ON w.id = s.warehouse_id AND ${warehouseFilter}
        WHERE p.company_id = $1::uuid AND p.status = 'ACTIVE'
      `, companyId),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.name, p.sku, p.unit, w.id AS "warehouseId", w.name AS "warehouseName", w.type AS "warehouseType",
               s.quantity, s.minimum_quantity AS "minimumQuantity", s.target_quantity AS "targetQuantity", s.cost_per_unit AS "costPerUnit"
        FROM inventory_stock s
        JOIN inventory_products p ON p.id = s.product_id
        JOIN inventory_warehouses w ON w.id = s.warehouse_id
        WHERE p.company_id = $1::uuid AND p.status = 'ACTIVE' AND ${warehouseFilter}
          AND s.quantity <= s.minimum_quantity AND s.minimum_quantity > 0
        ORDER BY s.quantity ASC, p.name ASC LIMIT 12
      `, companyId),
      this.prisma.$queryRawUnsafe<any[]>(`SELECT id, name, type, branch_id AS "branchId" FROM inventory_warehouses WHERE company_id = $1::uuid AND status = 'ACTIVE' ORDER BY type, name`, companyId),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT pr.id, p.name AS "productName", w.name AS "warehouseName", pr.current_quantity AS "currentQuantity", pr.requested_quantity AS "requestedQuantity", pr.status, pr.created_at AS "createdAt"
        FROM inventory_purchase_requests pr JOIN inventory_products p ON p.id=pr.product_id JOIN inventory_warehouses w ON w.id=pr.warehouse_id
        WHERE pr.company_id=$1::uuid AND pr.status IN ('PENDING','APPROVED','ORDERED') ORDER BY pr.created_at DESC LIMIT 8
      `, companyId),
    ]);

    return { metrics: row(metrics[0] ?? {}), critical, warehouses, purchaseRequests: purchases };
  }

  async products(search?: string) {
    await this.ensureWarehouses();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const filter = branchId ? `w.branch_id = '${branchId}'::uuid` : `w.company_id = '${companyId}'::uuid`;
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.sku, p.brand, p.description, p.unit, p.status, p.track_stock AS "trackStock", p.track_expiry AS "trackExpiry",
             COALESCE(SUM(CASE WHEN ${filter} THEN s.quantity ELSE 0 END),0) AS quantity,
             COALESCE(SUM(CASE WHEN ${filter} THEN s.minimum_quantity ELSE 0 END),0) AS "minimumQuantity",
             COALESCE(SUM(CASE WHEN ${filter} THEN s.target_quantity ELSE 0 END),0) AS "targetQuantity"
      FROM inventory_products p LEFT JOIN inventory_stock s ON s.product_id=p.id LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id
      WHERE p.company_id=$1::uuid AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%' OR COALESCE(p.sku,'') ILIKE '%' || $2 || '%')
      GROUP BY p.id ORDER BY p.name ASC
    `, companyId, search?.trim() || null);
  }

  async createProduct(input: { name: string; sku?: string; brand?: string; description?: string; unit?: string; minimumQuantity?: number; targetQuantity?: number; initialQuantity?: number; warehouseId?: string }) {
    await this.ensureWarehouses();
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const warehouseId = input.warehouseId ?? await this.defaultWarehouseId();
    const allowedUnits = ['UNIT','ML','LITER','GRAM','KG','METER','PAIR','BOX'];
    if (!allowedUnits.includes(input.unit ?? 'UNIT')) throw new BadRequestException('Invalid inventory unit');
    if (!input.name?.trim()) throw new BadRequestException('Product name is required');

    const created = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO inventory_products (tenant_id, company_id, name, sku, brand, description, unit)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::"InventoryUnit") RETURNING id,name,sku,brand,description,unit,status
    `, tenantId, companyId, input.name.trim(), input.sku?.trim() || null, input.brand?.trim() || null, input.description?.trim() || null, input.unit ?? 'UNIT');
    const product = created[0];
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO inventory_stock(product_id, warehouse_id, quantity, minimum_quantity, target_quantity)
      VALUES ($1::uuid,$2::uuid,$3,$4,$5)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET minimum_quantity=EXCLUDED.minimum_quantity,target_quantity=EXCLUDED.target_quantity,quantity=inventory_stock.quantity+EXCLUDED.quantity,updated_at=NOW()
    `, product.id, warehouseId, Number(input.initialQuantity ?? 0), Number(input.minimumQuantity ?? 0), Number(input.targetQuantity ?? 0));
    if (Number(input.initialQuantity ?? 0) > 0) await this.addMovement(product.id, warehouseId, Number(input.initialQuantity), 'PURCHASE', undefined, undefined, 'İlk stok girişi');
    return product;
  }

  private async defaultWarehouseId() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(branchId
      ? `SELECT id FROM inventory_warehouses WHERE company_id=$1::uuid AND branch_id=$2::uuid AND type='BRANCH' LIMIT 1`
      : `SELECT id FROM inventory_warehouses WHERE company_id=$1::uuid AND type='MAIN_DEPOT' LIMIT 1`, companyId, ...(branchId ? [branchId] : []));
    if (!rows.length) throw new BadRequestException('Inventory warehouse not found');
    return rows[0].id;
  }

  async addMovement(productId: string, warehouseId: string, quantity: number, type: string, unitCost?: number, referenceId?: string, note?: string) {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Quantity must be greater than zero');
    const tenantId = this.tenantId(); const companyId = this.companyId();
    const product = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM inventory_products WHERE id=$1::uuid AND company_id=$2::uuid AND status='ACTIVE' LIMIT 1`, productId, companyId);
    if (!product.length) throw new NotFoundException('Product not found');
    const warehouse = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM inventory_warehouses WHERE id=$1::uuid AND company_id=$2::uuid AND status='ACTIVE' LIMIT 1`, warehouseId, companyId);
    if (!warehouse.length) throw new NotFoundException('Warehouse not found');
    const outbound = ['ADJUSTMENT_OUT','DAMAGE','EXPIRED','SERVICE_CONSUMPTION','TRANSFER_OUT'].includes(type);
    if (outbound) {
      const stock = await this.prisma.$queryRawUnsafe<any[]>(`SELECT quantity FROM inventory_stock WHERE product_id=$1::uuid AND warehouse_id=$2::uuid FOR UPDATE`, productId, warehouseId);
      if (!stock.length || Number(stock[0].quantity) < quantity) throw new BadRequestException('Insufficient stock');
    }
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO inventory_stock(product_id,warehouse_id,quantity) VALUES($1::uuid,$2::uuid,0) ON CONFLICT DO NOTHING;
      UPDATE inventory_stock SET quantity=quantity + $3, updated_at=NOW() WHERE product_id=$1::uuid AND warehouse_id=$2::uuid;
      INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_id,note)
      VALUES($4::uuid,$5::uuid,$1::uuid,$2::uuid,$6::"InventoryMovementType",$3,$7,$8::uuid,$9);
    `, productId, warehouseId, outbound ? -quantity : quantity, tenantId, companyId, type, unitCost ?? null, referenceId ?? null, note ?? null);
    return { success: true };
  }

  async serviceMaterials(serviceId: string) {
    const companyId = this.companyId();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT ism.id, ism.product_id AS "productId", p.name AS "productName", p.unit, ism.quantity FROM inventory_service_materials ism JOIN inventory_products p ON p.id=ism.product_id JOIN services s ON s.id=ism.service_id WHERE ism.service_id=$1::uuid AND s.tenant_id=$2::uuid ORDER BY p.name`, serviceId, this.tenantId());
  }

  async setServiceMaterials(serviceId: string, materials: { productId: string; quantity: number }[]) {
    const tenantId = this.tenantId();
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    const service = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM services WHERE id=$1::uuid AND tenant_id=$2::uuid AND branch_id=$3::uuid LIMIT 1`, serviceId, tenantId, branchId);
    if (!service.length) throw new NotFoundException('Service not found');
    await this.prisma.$executeRawUnsafe(`DELETE FROM inventory_service_materials WHERE service_id=$1::uuid`, serviceId);
    for (const material of materials) {
      if (!Number.isFinite(material.quantity) || material.quantity <= 0) throw new BadRequestException('Material quantity must be greater than zero');
      await this.prisma.$executeRawUnsafe(`INSERT INTO inventory_service_materials(service_id,product_id,quantity) VALUES($1::uuid,$2::uuid,$3)`, serviceId, material.productId, material.quantity);
    }
    return this.serviceMaterials(serviceId);
  }

  async purchaseRequests() {
    const companyId = this.companyId();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT pr.id,p.name AS "productName",w.name AS "warehouseName",pr.current_quantity AS "currentQuantity",pr.requested_quantity AS "requestedQuantity",pr.status,pr.reason,pr.created_at AS "createdAt" FROM inventory_purchase_requests pr JOIN inventory_products p ON p.id=pr.product_id JOIN inventory_warehouses w ON w.id=pr.warehouse_id WHERE pr.company_id=$1::uuid ORDER BY pr.created_at DESC`, companyId);
  }
}
