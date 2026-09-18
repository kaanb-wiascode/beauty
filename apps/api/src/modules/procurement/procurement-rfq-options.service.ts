import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementRfqOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async get() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    const [warehouses, products, suppliers] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,name,type,branch_id AS "branchId"
         FROM inventory_warehouses
         WHERE tenant_id=$1::text AND company_id=$2::text AND status='ACTIVE'
           AND ($3::text IS NULL OR branch_id=$3::text)
         ORDER BY type,name`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT ip.id AS "inventoryProductId",ip.name AS "inventoryProductName",ip.sku,
                l.catalog_variant_id AS "catalogVariantId",
                cp.name AS "catalogProductName",cv.name AS "catalogVariantName",
                cv.canonical_sku AS "canonicalSku",cv.unit,cb.name AS "brandName"
         FROM inventory_product_catalog_links l
         JOIN inventory_products ip
           ON ip.id=l.inventory_product_id
          AND ip.tenant_id=l.tenant_id
          AND ip.company_id=l.company_id
          AND ip.status='ACTIVE'
         JOIN catalog_variants cv ON cv.id=l.catalog_variant_id AND cv.status='ACTIVE'
         JOIN catalog_products cp ON cp.id=cv.catalog_product_id AND cp.status='ACTIVE'
         LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id
         WHERE l.tenant_id=$1::text AND l.company_id=$2::text
         ORDER BY ip.name`,
        tenantId,
        companyId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT sc.id AS "supplierConnectionId",
                sc.inventory_supplier_id AS "inventorySupplierId",
                sc.supplier_organization_id AS "supplierOrganizationId",
                so.display_name AS "supplierName",so.organization_type AS "organizationType"
         FROM supplier_connections sc
         JOIN supplier_organizations so ON so.id=sc.supplier_organization_id
         WHERE sc.tenant_id=$1::text AND sc.company_id=$2::text
           AND sc.status='ACTIVE'
           AND so.status='ACTIVE' AND so.verification_status='VERIFIED'
         ORDER BY so.display_name`,
        tenantId,
        companyId,
      ),
    ]);

    return { warehouses, products, suppliers };
  }
}
