import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class SupplierCatalogBuyerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
    };
  }

  async listVariants() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT cv.id,cv.catalog_product_id AS "catalogProductId",cv.canonical_sku AS "canonicalSku",
              cv.name AS "variantName",cv.unit,cv.attributes,
              cp.name AS "productName",cp.category_code AS "categoryCode",
              cb.name AS "brandName",
              COUNT(so.id) FILTER (
                WHERE so.status='ACTIVE'
                  AND (so.valid_from IS NULL OR so.valid_from<=NOW())
                  AND (so.valid_to IS NULL OR so.valid_to>NOW())
              )::int AS "activeOfferCount"
       FROM catalog_variants cv
       JOIN catalog_products cp ON cp.id=cv.catalog_product_id AND cp.status='ACTIVE'
       LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id AND cb.status='ACTIVE'
       LEFT JOIN supplier_offers so ON so.catalog_variant_id=cv.id
       WHERE cv.status='ACTIVE'
       GROUP BY cv.id,cp.id,cb.id,cb.name
       ORDER BY cp.name,cv.name`,
    );
  }

  async listLinks() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,l.inventory_product_id AS "inventoryProductId",
              ip.name AS "inventoryProductName",ip.sku AS "inventorySku",
              l.catalog_variant_id AS "catalogVariantId",
              cp.name AS "catalogProductName",cv.name AS "catalogVariantName",
              cv.canonical_sku AS "canonicalSku",cb.name AS "brandName",
              l.created_at AS "createdAt",l.updated_at AS "updatedAt"
       FROM inventory_product_catalog_links l
       JOIN inventory_products ip
         ON ip.id=l.inventory_product_id
        AND ip.tenant_id=l.tenant_id
        AND ip.company_id=l.company_id
       JOIN catalog_variants cv ON cv.id=l.catalog_variant_id
       JOIN catalog_products cp ON cp.id=cv.catalog_product_id
       LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text
       ORDER BY ip.name`,
      tenantId,
      companyId,
    );
  }

  async linkProduct(
    inventoryProductId: string,
    catalogVariantId: string,
    actorUserId: string,
  ) {
    const { tenantId, companyId } = this.context();
    const [products, variants] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM inventory_products
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND status='ACTIVE'
         LIMIT 1`,
        inventoryProductId,
        tenantId,
        companyId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM catalog_variants
         WHERE id=$1::text AND status='ACTIVE'
         LIMIT 1`,
        catalogVariantId,
      ),
    ]);
    if (!products.length) {
      throw new NotFoundException('Inventory product not found in company scope');
    }
    if (!variants.length) {
      throw new NotFoundException('Active catalog variant not found');
    }

    return (
      await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO inventory_product_catalog_links(
           tenant_id,company_id,inventory_product_id,catalog_variant_id,linked_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text)
         ON CONFLICT (inventory_product_id)
         DO UPDATE SET
           catalog_variant_id=EXCLUDED.catalog_variant_id,
           linked_by_user_id=EXCLUDED.linked_by_user_id,
           updated_at=NOW()
         RETURNING id,inventory_product_id AS "inventoryProductId",
                   catalog_variant_id AS "catalogVariantId",created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
        tenantId,
        companyId,
        inventoryProductId,
        catalogVariantId,
        actorUserId,
      )
    )[0];
  }
}
