import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class SupplierOfferBuyerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async listConnectedOffers(catalogVariantId?: string) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT so.id,so.catalog_variant_id AS "catalogVariantId",so.supplier_sku AS "supplierSku",
              so.currency,so.unit_price AS "unitPrice",so.minimum_order_quantity AS "minimumOrderQuantity",
              so.order_multiple AS "orderMultiple",so.available_quantity AS "availableQuantity",
              so.lead_time_days AS "leadTimeDays",so.preparation_days AS "preparationDays",so.shipping_days AS "shippingDays",
              so.valid_from AS "validFrom",so.valid_to AS "validTo",so.version,
              sc.inventory_supplier_id AS "inventorySupplierId",org.id AS "supplierOrganizationId",org.display_name AS "supplierName",
              cp.id AS "catalogProductId",cp.name AS "productName",cv.name AS "variantName",cv.canonical_sku AS "canonicalSku",
              cb.name AS "brandName",cv.unit,cv.attributes
       FROM supplier_connections sc
       JOIN supplier_organizations org ON org.id=sc.supplier_organization_id
       JOIN supplier_offers so ON so.supplier_organization_id=org.id
       JOIN catalog_variants cv ON cv.id=so.catalog_variant_id
       JOIN catalog_products cp ON cp.id=cv.catalog_product_id
       LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id
       WHERE sc.tenant_id=$1::text AND sc.company_id=$2::text AND sc.status='ACTIVE'
         AND org.status='ACTIVE' AND org.verification_status='VERIFIED'
         AND so.status='ACTIVE'
         AND (so.valid_from IS NULL OR so.valid_from<=NOW())
         AND (so.valid_to IS NULL OR so.valid_to>NOW())
         AND cv.status='ACTIVE' AND cp.status='ACTIVE'
         AND ($3::text IS NULL OR so.catalog_variant_id=$3::text)
       ORDER BY cp.name,cv.name,so.unit_price ASC,org.display_name`,
      tenantId,
      companyId,
      catalogVariantId ?? null,
    );
  }
}
