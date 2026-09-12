import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

const row = (value: any) => value;
type RawDb = Pick<
  Prisma.TransactionClient,
  '$queryRawUnsafe' | '$executeRawUnsafe'
>;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

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

  private async requireWarehouse(
    db: RawDb,
    warehouseId: string,
    companyId = this.companyId(),
  ) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_warehouses WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
      warehouseId,
      companyId,
    );
    if (!rows.length) throw new NotFoundException('Warehouse not found');
  }

  private async requireWarehouseInActiveScope(
    db: RawDb,
    warehouseId: string,
    companyId = this.companyId(),
  ) {
    const branchId = this.tenantContext.getBranchId();
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId" FROM inventory_warehouses
       WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE'
         AND ($3::text IS NULL OR branch_id=$3::text)
       LIMIT 1`,
      warehouseId,
      companyId,
      branchId,
    );
    if (!rows.length) {
      throw new BadRequestException(
        'Warehouse is outside the active branch scope.',
      );
    }
    return rows[0];
  }

  private async requireProduct(
    db: RawDb,
    productId: string,
    companyId = this.companyId(),
  ) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_products WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
      productId,
      companyId,
    );
    if (!rows.length) throw new NotFoundException('Product not found');
  }

  private async requireSupplier(
    db: RawDb,
    supplierId: string,
    companyId = this.companyId(),
  ) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_suppliers WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
      supplierId,
      companyId,
    );
    if (!rows.length) throw new NotFoundException('Supplier not found');
  }

  private async requireCategory(
    db: RawDb,
    categoryId: string,
    companyId = this.companyId(),
  ) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_categories WHERE id=$1::text AND company_id=$2::text AND is_active=TRUE LIMIT 1`,
      categoryId,
      companyId,
    );
    if (!rows.length) throw new NotFoundException('Category not found');
  }

  private async ensureWarehouses() {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO inventory_warehouses(tenant_id,company_id,name,type) VALUES($1::text,$2::text,'Ana Depo','MAIN_DEPOT') ON CONFLICT DO NOTHING`,
      tenantId,
      companyId,
    );

    if (branchId) {
      const branches = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,name FROM branches WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
        branchId,
        companyId,
      );
      if (!branches.length) throw new NotFoundException('Branch not found');

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO inventory_warehouses(tenant_id,company_id,branch_id,name,type) VALUES($1::text,$2::text,$3::text,$4,'BRANCH') ON CONFLICT DO NOTHING`,
        tenantId,
        companyId,
        branchId,
        `${branches[0].name} Stok`,
      );
    }
  }

  async overview() {
    await this.ensureWarehouses();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const filter = branchId
      ? `w.branch_id='${branchId}'::text`
      : `w.company_id='${companyId}'::text`;

    const [metrics, critical, warehouses, purchaseRequests] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(DISTINCT p.id)::int AS "totalProducts", COUNT(DISTINCT CASE WHEN s.quantity<=s.minimum_quantity AND s.minimum_quantity>0 THEN p.id END)::int AS "criticalProducts", COALESCE(SUM(s.quantity*s.cost_per_unit),0)::numeric AS "inventoryValue" FROM inventory_products p LEFT JOIN inventory_stock s ON s.product_id=p.id LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id AND ${filter} WHERE p.company_id=$1::text AND p.status='ACTIVE'`,
          companyId,
        ),
        this.prisma.$queryRawUnsafe<any[]>(
          `SELECT p.id,p.name,p.sku,p.unit,w.id AS "warehouseId",w.name AS "warehouseName",w.type AS "warehouseType",s.quantity,s.minimum_quantity AS "minimumQuantity",s.target_quantity AS "targetQuantity" FROM inventory_stock s JOIN inventory_products p ON p.id=s.product_id JOIN inventory_warehouses w ON w.id=s.warehouse_id WHERE p.company_id=$1::text AND p.status='ACTIVE' AND ${filter} AND s.quantity<=s.minimum_quantity AND s.minimum_quantity>0 ORDER BY s.quantity ASC,p.name ASC LIMIT 12`,
          companyId,
        ),
        this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id,name,type,branch_id AS "branchId" FROM inventory_warehouses WHERE company_id=$1::text AND status='ACTIVE' ORDER BY type,name`,
          companyId,
        ),
        this.purchaseRequests(),
      ]);

    let assetCount = 0;
    try {
      assetCount = (await this.assets()).length;
    } catch (error) {
      console.error('[inventory] asset overview query failed', error);
    }

    let expiringLots = 0;
    try {
      const lots = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count FROM inventory_product_lots WHERE company_id=$1::text AND expires_at IS NOT NULL AND expires_at <= NOW()+INTERVAL '30 days' AND quantity>0`,
        companyId,
      );
      expiringLots = Number(lots[0]?.count ?? 0);
    } catch (error) {
      console.error('[inventory] expiry overview query failed', error);
    }

    return {
      metrics: row(metrics[0] ?? {}),
      critical,
      warehouses,
      purchaseRequests,
      assetCount,
      expiringLots,
    };
  }

  async products(search?: string) {
    await this.ensureWarehouses();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const filter = branchId
      ? `w.branch_id='${branchId}'::text`
      : `w.company_id='${companyId}'::text`;

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.name,p.sku,p.barcode,p.brand,p.manufacturer,p.model,p.description,p.unit,p.status,p.track_stock AS "trackStock",p.track_expiry AS "trackExpiry",p.category_id AS "categoryId",c.name AS "categoryName",p.purchase_price AS "purchasePrice",p.sale_price AS "salePrice",p.currency,p.tax_rate AS "taxRate",p.lead_time_days AS "leadTimeDays",p.shipping_days AS "shippingDays",COALESCE(SUM(CASE WHEN ${filter} THEN s.quantity ELSE 0 END),0) AS quantity,COALESCE(SUM(CASE WHEN ${filter} THEN s.minimum_quantity ELSE 0 END),0) AS "minimumQuantity",COALESCE(SUM(CASE WHEN ${filter} THEN s.target_quantity ELSE 0 END),0) AS "targetQuantity" FROM inventory_products p LEFT JOIN inventory_stock s ON s.product_id=p.id LEFT JOIN inventory_warehouses w ON w.id=s.warehouse_id LEFT JOIN inventory_categories c ON c.id=p.category_id WHERE p.company_id=$1::text AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%' OR COALESCE(p.sku,'') ILIKE '%'||$2||'%' OR COALESCE(p.barcode,'') ILIKE '%'||$2||'%') GROUP BY p.id,c.name ORDER BY p.name`,
      companyId,
      search?.trim() || null,
    );
  }

  async categories() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name,code,parent_id AS "parentId",description,default_unit AS "defaultUnit",is_active AS "isActive" FROM inventory_categories WHERE company_id=$1::text ORDER BY COALESCE(parent_id,''),name`,
      this.companyId(),
    );
  }

  async createCategory(input: any) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    if (!input.name?.trim()) {
      throw new BadRequestException('Category name is required');
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.parentId) {
        await this.requireCategory(tx, input.parentId, companyId);
      }

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_categories(tenant_id,company_id,name,code,parent_id,description,default_unit) VALUES($1::text,$2::text,$3,$4,$5::text,$6,$7::"InventoryUnit") RETURNING id,name,code,parent_id AS "parentId",description,default_unit AS "defaultUnit",is_active AS "isActive"`,
        tenantId,
        companyId,
        input.name.trim(),
        input.code?.trim() || null,
        input.parentId || null,
        input.description || null,
        input.defaultUnit || null,
      );
      return rows[0];
    });
  }

  async createProduct(input: any) {
    await this.ensureWarehouses();
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const warehouseId = input.warehouseId ?? (await this.defaultWarehouseId());
    const units = ['UNIT', 'ML', 'LITER', 'GRAM', 'KG', 'METER', 'PAIR', 'BOX'];

    if (!units.includes(input.unit ?? 'UNIT')) {
      throw new BadRequestException('Invalid inventory unit');
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('Product name is required');
    }

    const initial = Number(input.initialQuantity || 0);

    return this.prisma.$transaction(async (tx) => {
      await this.requireWarehouseInActiveScope(tx, warehouseId, companyId);
      if (input.categoryId) {
        await this.requireCategory(tx, input.categoryId, companyId);
      }
      if (input.supplierId) {
        await this.requireSupplier(tx, input.supplierId, companyId);
      }

      const created = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_products(tenant_id,company_id,category_id,name,sku,barcode,brand,manufacturer,model,description,origin_country,package_quantity,unit,status,track_stock,track_expiry,tax_rate,purchase_price,sale_price,currency,minimum_order_quantity,order_multiple,lead_time_days,preparation_days,shipping_days,returnable,image_url,notes) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::"InventoryUnit",'ACTIVE',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id,name,sku,barcode,brand,manufacturer,model,description,unit,status,category_id AS "categoryId"`,
        tenantId,
        companyId,
        input.categoryId || null,
        input.name.trim(),
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.brand?.trim() || null,
        input.manufacturer?.trim() || null,
        input.model?.trim() || null,
        input.description?.trim() || null,
        input.originCountry || null,
        input.packageQuantity ?? null,
        input.unit ?? 'UNIT',
        input.trackStock !== false,
        input.trackExpiry === true,
        Number(input.taxRate ?? 20),
        Number(input.purchasePrice ?? 0),
        Number(input.salePrice ?? 0),
        input.currency || 'TRY',
        Number(input.minimumOrderQuantity || 1),
        Number(input.orderMultiple || 1),
        Number(input.leadTimeDays || 0),
        Number(input.preparationDays || 0),
        Number(input.shippingDays || 0),
        input.returnable !== false,
        input.imageUrl || null,
        input.notes || null,
      );

      const product = created[0];
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_stock(product_id,warehouse_id,quantity,minimum_quantity,target_quantity,cost_per_unit) VALUES($1::text,$2::text,$3,$4,$5,$6) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET minimum_quantity=EXCLUDED.minimum_quantity,target_quantity=EXCLUDED.target_quantity,cost_per_unit=EXCLUDED.cost_per_unit,quantity=inventory_stock.quantity+EXCLUDED.quantity,updated_at=NOW()`,
        product.id,
        warehouseId,
        initial,
        Number(input.minimumQuantity || 0),
        Number(input.targetQuantity || 0),
        Number(input.purchasePrice || 0),
      );

      if (initial > 0) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,note) VALUES($1::text,$2::text,$3::text,$4::text,'PURCHASE',$5,$6,$7)`,
          tenantId,
          companyId,
          product.id,
          warehouseId,
          initial,
          Number(input.purchasePrice || 0),
          'İlk stok girişi',
        );
      }

      if (input.supplierId) {
        await this.linkProductSupplierWithDb(
          tx,
          product.id,
          input.supplierId,
          input,
          tenantId,
          companyId,
        );
      }

      return product;
    });
  }

  private async linkProductSupplierWithDb(
    db: RawDb,
    productId: string,
    supplierId: string,
    input: any,
    tenantId = this.tenantId(),
    companyId = this.companyId(),
  ) {
    await this.requireProduct(db, productId, companyId);
    await this.requireSupplier(db, supplierId, companyId);

    const rows = await db.$queryRawUnsafe<any[]>(
      `INSERT INTO inventory_product_suppliers(tenant_id,company_id,product_id,supplier_id,supplier_product_code,is_primary,unit_cost,currency,minimum_order_quantity,order_multiple,lead_time_days,preparation_days,shipping_days) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(product_id,supplier_id) DO UPDATE SET supplier_product_code=EXCLUDED.supplier_product_code,is_primary=EXCLUDED.is_primary,unit_cost=EXCLUDED.unit_cost,currency=EXCLUDED.currency,minimum_order_quantity=EXCLUDED.minimum_order_quantity,order_multiple=EXCLUDED.order_multiple,lead_time_days=EXCLUDED.lead_time_days,preparation_days=EXCLUDED.preparation_days,shipping_days=EXCLUDED.shipping_days,updated_at=NOW() RETURNING id`,
      tenantId,
      companyId,
      productId,
      supplierId,
      input.supplierProductCode || null,
      input.isPrimary !== false,
      Number(input.unitCost ?? input.purchasePrice ?? 0),
      input.currency || 'TRY',
      Number(input.supplierMinimumOrderQuantity || input.minimumOrderQuantity || 1),
      Number(input.supplierOrderMultiple || input.orderMultiple || 1),
      Number(input.supplierLeadTimeDays || input.leadTimeDays || 0),
      Number(input.supplierPreparationDays || input.preparationDays || 0),
      Number(input.supplierShippingDays || input.shippingDays || 0),
    );
    return rows[0];
  }

  async linkProductSupplier(
    productId: string,
    supplierId: string,
    input: any,
  ) {
    return this.prisma.$transaction((tx) =>
      this.linkProductSupplierWithDb(
        tx,
        productId,
        supplierId,
        input,
      ),
    );
  }

  private async defaultWarehouseId() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      branchId
        ? `SELECT id FROM inventory_warehouses WHERE company_id=$1::text AND branch_id=$2::text AND type='BRANCH' AND status='ACTIVE' LIMIT 1`
        : `SELECT id FROM inventory_warehouses WHERE company_id=$1::text AND type='MAIN_DEPOT' AND status='ACTIVE' LIMIT 1`,
      companyId,
      ...(branchId ? [branchId] : []),
    );
    if (!rows.length) {
      throw new BadRequestException('Inventory warehouse not found');
    }
    return rows[0].id;
  }

  async addMovement(
    productId: string,
    warehouseId: string,
    quantity: number,
    type: string,
    unitCost?: number,
    referenceId?: string,
    note?: string,
  ) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const outbound = [
      'ADJUSTMENT_OUT',
      'DAMAGE',
      'EXPIRED',
      'SERVICE_CONSUMPTION',
      'TRANSFER_OUT',
    ].includes(type);

    return this.prisma.$transaction(async (tx) => {
      await this.requireProduct(tx, productId, companyId);
      await this.requireWarehouseInActiveScope(tx, warehouseId, companyId);

      if (outbound) {
        const stock = await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity FROM inventory_stock WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          productId,
          warehouseId,
        );
        if (!stock.length || Number(stock[0].quantity) < quantity) {
          throw new BadRequestException('Insufficient stock');
        }
      } else {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_stock(product_id,warehouse_id,quantity) VALUES($1::text,$2::text,0) ON CONFLICT DO NOTHING`,
          productId,
          warehouseId,
        );
        await tx.$queryRawUnsafe<any[]>(
          `SELECT quantity FROM inventory_stock WHERE product_id=$1::text AND warehouse_id=$2::text FOR UPDATE`,
          productId,
          warehouseId,
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE inventory_stock SET quantity=quantity+$3,updated_at=NOW() WHERE product_id=$1::text AND warehouse_id=$2::text`,
        productId,
        warehouseId,
        outbound ? -quantity : quantity,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_movements(tenant_id,company_id,product_id,warehouse_id,type,quantity,unit_cost,reference_id,note) VALUES($1::text,$2::text,$3::text,$4::text,$5::"InventoryMovementType",$6,$7,$8::text,$9)`,
        tenantId,
        companyId,
        productId,
        warehouseId,
        type,
        outbound ? -quantity : quantity,
        unitCost ?? null,
        referenceId ?? null,
        note ?? null,
      );

      return { success: true };
    });
  }

  async movements(limit = 80) {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id,m.type,m.quantity,m.unit_cost AS "unitCost",m.note,m.created_at AS "createdAt",p.name AS "productName",p.unit,w.name AS "warehouseName"
       FROM inventory_movements m
       JOIN inventory_products p ON p.id=m.product_id
       JOIN inventory_warehouses w ON w.id=m.warehouse_id
       WHERE m.company_id=$1::text AND ($2::text IS NULL OR w.branch_id=$2::text)
       ORDER BY m.created_at DESC LIMIT $3`,
      companyId,
      branchId,
      Math.min(limit, 200),
    );
  }

  async serviceMaterials(serviceId: string) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ism.id,ism.product_id AS "productId",p.name AS "productName",p.unit,ism.quantity FROM inventory_service_materials ism JOIN inventory_products p ON p.id=ism.product_id JOIN services s ON s.id=ism.service_id WHERE ism.service_id=$1::text AND s.tenant_id=$2::text ORDER BY p.name`,
      serviceId,
      this.tenantId(),
    );
  }

  async setServiceMaterials(
    serviceId: string,
    materials: { productId: string; quantity: number }[],
  ) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM services WHERE id=$1::text AND tenant_id=$2::text AND branch_id=$3::text LIMIT 1`,
        serviceId,
        tenantId,
        branchId,
      );
      if (!service.length) throw new NotFoundException('Service not found');

      for (const material of materials) {
        if (!Number.isFinite(material.quantity) || material.quantity <= 0) {
          throw new BadRequestException(
            'Material quantity must be greater than zero',
          );
        }
        await this.requireProduct(tx, material.productId, companyId);
      }

      await tx.$executeRawUnsafe(
        `DELETE FROM inventory_service_materials WHERE service_id=$1::text`,
        serviceId,
      );
      for (const material of materials) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_service_materials(service_id,product_id,quantity) VALUES($1::text,$2::text,$3)`,
          serviceId,
          material.productId,
          material.quantity,
        );
      }
    }).then(() => this.serviceMaterials(serviceId));
  }

  async purchaseRequests() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pr.id,p.name AS "productName",w.name AS "warehouseName",pr.current_quantity AS "currentQuantity",pr.requested_quantity AS "requestedQuantity",pr.status,pr.reason,pr.created_at AS "createdAt"
       FROM inventory_purchase_requests pr
       JOIN inventory_products p ON p.id=pr.product_id
       JOIN inventory_warehouses w ON w.id=pr.warehouse_id
       WHERE pr.company_id=$1::text AND ($2::text IS NULL OR w.branch_id=$2::text)
       ORDER BY pr.created_at DESC`,
      companyId,
      branchId,
    );
  }

  async suppliers() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name,contact_name AS "contactName",phone,email,tax_number AS "taxNumber",address,notes,status FROM inventory_suppliers WHERE company_id=$1::text AND status='ACTIVE' ORDER BY name`,
      this.companyId(),
    );
  }

  async createSupplier(input: any) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    if (!input.name?.trim()) {
      throw new BadRequestException('Supplier name is required');
    }
    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_suppliers(tenant_id,company_id,name,contact_name,phone,email,tax_number,address,notes) VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,contact_name AS "contactName",phone,email,tax_number AS "taxNumber",address,notes,status`,
        tenantId,
        companyId,
        input.name.trim(),
        input.contactName || null,
        input.phone || null,
        input.email || null,
        input.taxNumber || null,
        input.address || null,
        input.notes || null,
      )
    )[0];
  }

  async assets() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    try {
      return await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.asset_code AS "assetCode",a.name,a.asset_type AS "assetType",a.brand,a.model,a.serial_number AS "serialNumber",a.status,a.condition,a.branch_id AS "branchId",br.name AS "branchName",a.assigned_to_staff_id AS "assignedToStaffId",a.purchase_date AS "purchaseDate",a.purchase_price AS "purchasePrice",a.currency,a.warranty_end AS "warrantyEnd",a.next_maintenance_at AS "nextMaintenanceAt",a.category_id AS "categoryId",c.name AS "categoryName" FROM inventory_assets a LEFT JOIN branches br ON br.id=a.branch_id LEFT JOIN inventory_categories c ON c.id=a.category_id WHERE a.company_id=$1::text ${branchId ? `AND (a.branch_id=$2::text OR a.branch_id IS NULL)` : ''} ORDER BY a.name`,
        companyId,
        ...(branchId ? [branchId] : []),
      );
    } catch (error) {
      console.error('[inventory] assets query failed', error);
      return [];
    }
  }

  async createAsset(input: any) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    const contextBranchId = this.tenantContext.getBranchId();
    if (!input.name?.trim()) throw new BadRequestException('Asset name is required');
    if (!input.assetCode?.trim()) throw new BadRequestException('Asset code is required');

    return this.prisma.$transaction(async (tx) => {
      if (input.categoryId) {
        await this.requireCategory(tx, input.categoryId, companyId);
      }
      if (input.supplierId) {
        await this.requireSupplier(tx, input.supplierId, companyId);
      }

      let effectiveBranchId: string | null = input.branchId || null;

      if (input.branchId) {
        const branches = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM branches WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
          input.branchId,
          companyId,
        );
        if (!branches.length) throw new NotFoundException('Branch not found');
      }

      if (contextBranchId) {
        if (effectiveBranchId && effectiveBranchId !== contextBranchId) {
          throw new BadRequestException(
            'Asset branch must match the active branch context.',
          );
        }
        effectiveBranchId = contextBranchId;
      }

      if (input.warehouseId) {
        const warehouses = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId" FROM inventory_warehouses WHERE id=$1::text AND company_id=$2::text AND status='ACTIVE' LIMIT 1`,
          input.warehouseId,
          companyId,
        );
        if (!warehouses.length) throw new NotFoundException('Warehouse not found');

        const warehouseBranchId = warehouses[0].branchId as string | null;
        if (
          warehouseBranchId &&
          effectiveBranchId &&
          warehouseBranchId !== effectiveBranchId
        ) {
          throw new BadRequestException(
            'Asset warehouse must belong to the selected branch.',
          );
        }
        if (!effectiveBranchId && warehouseBranchId) {
          effectiveBranchId = warehouseBranchId;
        }
      }

      if (input.assignedToStaffId) {
        const staff = await tx.$queryRawUnsafe<any[]>(
          `SELECT s.id,s.branch_id AS "branchId" FROM staff s JOIN branches b ON b.id=s.branch_id WHERE s.id=$1::text AND s.tenant_id=$2::text AND s.status='ACTIVE' AND b.company_id=$3::text AND b.status='ACTIVE' LIMIT 1`,
          input.assignedToStaffId,
          tenantId,
          companyId,
        );
        if (!staff.length) throw new NotFoundException('Staff not found');

        const staffBranchId = staff[0].branchId as string;
        if (effectiveBranchId && staffBranchId !== effectiveBranchId) {
          throw new BadRequestException(
            'Assigned staff must belong to the asset branch.',
          );
        }
        if (!effectiveBranchId) {
          effectiveBranchId = staffBranchId;
        }
      }

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_assets(tenant_id,company_id,category_id,asset_code,name,asset_type,brand,model,serial_number,status,condition,branch_id,warehouse_id,assigned_to_staff_id,purchase_date,supplier_id,invoice_number,purchase_price,currency,warranty_start,warranty_end,maintenance_interval_days,next_maintenance_at,image_url,notes) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11,$12::text,$13::text,$14::text,$15::timestamptz,$16::text,$17,$18,$19,$20::timestamptz,$21::timestamptz,$22,$23::timestamptz,$24,$25) RETURNING id,asset_code AS "assetCode",name,asset_type AS "assetType",status,condition`,
        tenantId,
        companyId,
        input.categoryId || null,
        input.assetCode.trim(),
        input.name.trim(),
        input.assetType || 'EQUIPMENT',
        input.brand || null,
        input.model || null,
        input.serialNumber || null,
        input.status || 'ACTIVE',
        input.condition || 'GOOD',
        effectiveBranchId,
        input.warehouseId || null,
        input.assignedToStaffId || null,
        input.purchaseDate || null,
        input.supplierId || null,
        input.invoiceNumber || null,
        Number(input.purchasePrice || 0),
        input.currency || 'TRY',
        input.warrantyStart || null,
        input.warrantyEnd || null,
        input.maintenanceIntervalDays
          ? Number(input.maintenanceIntervalDays)
          : null,
        input.nextMaintenanceAt || null,
        input.imageUrl || null,
        input.notes || null,
      );
      const asset = rows[0];

      if (input.assignedToStaffId || effectiveBranchId) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_asset_assignments(asset_id,staff_id,branch_id,note) VALUES($1::text,$2::text,$3::text,$4)`,
          asset.id,
          input.assignedToStaffId || null,
          effectiveBranchId,
          'İlk envanter kaydı',
        );
      }

      return asset;
    });
  }

  async assetMaintenance(assetId?: string) {
    const companyId = this.companyId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id,m.asset_id AS "assetId",a.name AS "assetName",m.type,m.status,m.scheduled_at AS "scheduledAt",m.completed_at AS "completedAt",m.provider,m.cost,m.currency,m.description FROM inventory_asset_maintenance m JOIN inventory_assets a ON a.id=m.asset_id WHERE a.company_id=$1::text ${assetId ? `AND m.asset_id=$2::text` : ''} ORDER BY COALESCE(m.scheduled_at,m.created_at) DESC`,
      companyId,
      ...(assetId ? [assetId] : []),
    );
  }

  async createAssetMaintenance(input: any) {
    if (!input.assetId) throw new BadRequestException('Asset is required');
    const companyId = this.companyId();
    const asset = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM inventory_assets WHERE id=$1::text AND company_id=$2::text LIMIT 1`,
      input.assetId,
      companyId,
    );
    if (!asset.length) throw new NotFoundException('Asset not found');

    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_asset_maintenance(asset_id,type,status,scheduled_at,completed_at,provider,cost,currency,description) VALUES($1::text,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9) RETURNING id,asset_id AS "assetId",type,status,scheduled_at AS "scheduledAt",provider,cost,currency,description`,
        input.assetId,
        input.type || 'PREVENTIVE',
        input.status || 'PLANNED',
        input.scheduledAt || null,
        input.completedAt || null,
        input.provider || null,
        Number(input.cost || 0),
        input.currency || 'TRY',
        input.description || null,
      )
    )[0];
  }

  async notifications() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,type,title,message,branch_id AS "branchId",role_target AS "roleTarget",reference_type AS "referenceType",reference_id AS "referenceId",read_at AS "readAt",created_at AS "createdAt" FROM inventory_notifications WHERE company_id=$1::text ORDER BY created_at DESC LIMIT 80`,
      this.companyId(),
    );
  }

  async purchaseOrders() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT po.id,po.status,po.total_amount AS "totalAmount",po.ordered_at AS "orderedAt",po.received_at AS "receivedAt",s.name AS "supplierName",w.name AS "warehouseName",COUNT(i.id)::int AS "itemCount"
       FROM inventory_purchase_orders po
       LEFT JOIN inventory_suppliers s ON s.id=po.supplier_id
       JOIN inventory_warehouses w ON w.id=po.warehouse_id
       LEFT JOIN inventory_purchase_order_items i ON i.purchase_order_id=po.id
       WHERE po.company_id=$1::text AND ($2::text IS NULL OR w.branch_id=$2::text)
       GROUP BY po.id,s.name,w.name ORDER BY po.created_at DESC`,
      companyId,
      branchId,
    );
  }

  async createPurchaseOrder(input: any) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    if (!input.warehouseId || !input.items?.length) {
      throw new BadRequestException(
        'Warehouse and at least one item are required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.requireWarehouseInActiveScope(tx, input.warehouseId, companyId);
      if (input.supplierId) {
        await this.requireSupplier(tx, input.supplierId, companyId);
      }

      let totalAmount = 0;
      for (const item of input.items) {
        const quantity = Number(item.quantity);
        const unitCost = Number(item.unitCost || 0);
        if (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(unitCost) ||
          unitCost < 0
        ) {
          throw new BadRequestException('Invalid purchase order item');
        }
        await this.requireProduct(tx, item.productId, companyId);
        totalAmount += quantity * unitCost;
      }
      totalAmount = Math.round(totalAmount * 100) / 100;

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_purchase_orders(tenant_id,company_id,supplier_id,warehouse_id,status,total_amount,note,ordered_at) VALUES($1::text,$2::text,$3::text,$4::text,$5::"InventoryPurchaseStatus",$6,$7,$8::timestamptz) RETURNING id,status,total_amount AS "totalAmount"`,
        tenantId,
        companyId,
        input.supplierId || null,
        input.warehouseId,
        input.status || 'DRAFT',
        totalAmount,
        input.note || null,
        input.orderedAt || null,
      );

      for (const item of input.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_purchase_order_items(purchase_order_id,product_id,quantity,unit_cost) VALUES($1::text,$2::text,$3,$4)`,
          rows[0].id,
          item.productId,
          Number(item.quantity),
          Number(item.unitCost || 0),
        );
      }
      return rows[0];
    });
  }

  async transfers() {
    const companyId = this.companyId();
    const branchId = this.tenantContext.getBranchId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id,t.status,t.note,t.created_at AS "createdAt",s.name AS "sourceName",d.name AS "destinationName",COUNT(i.id)::int AS "itemCount"
       FROM inventory_transfers t
       JOIN inventory_warehouses s ON s.id=t.source_warehouse_id
       JOIN inventory_warehouses d ON d.id=t.destination_warehouse_id
       LEFT JOIN inventory_transfer_items i ON i.transfer_id=t.id
       WHERE t.company_id=$1::text
         AND ($2::text IS NULL OR s.branch_id=$2::text OR d.branch_id=$2::text)
       GROUP BY t.id,s.name,d.name ORDER BY t.created_at DESC`,
      companyId,
      branchId,
    );
  }

  async createTransfer(input: any) {
    const tenantId = this.tenantId();
    const companyId = this.companyId();
    if (
      !input.sourceWarehouseId ||
      !input.destinationWarehouseId ||
      input.sourceWarehouseId === input.destinationWarehouseId
    ) {
      throw new BadRequestException(
        'Valid source and destination warehouses are required',
      );
    }
    if (!Array.isArray(input.items) || !input.items.length) {
      throw new BadRequestException(
        'Transfer must contain at least one item',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.requireWarehouseInActiveScope(
        tx,
        input.sourceWarehouseId,
        companyId,
      );
      await this.requireWarehouse(tx, input.destinationWarehouseId, companyId);

      for (const item of input.items) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException('Invalid transfer quantity');
        }
        await this.requireProduct(tx, item.productId, companyId);
      }

      const created = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_transfers(tenant_id,company_id,source_warehouse_id,destination_warehouse_id,status,note) VALUES($1::text,$2::text,$3::text,$4::text,'PENDING',$5) RETURNING id`,
        tenantId,
        companyId,
        input.sourceWarehouseId,
        input.destinationWarehouseId,
        input.note || null,
      );

      for (const item of input.items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_transfer_items(transfer_id,product_id,quantity) VALUES($1::text,$2::text,$3)`,
          created[0].id,
          item.productId,
          Number(item.quantity),
        );
      }
      return { ...created[0], status: 'PENDING' };
    });
  }
}
