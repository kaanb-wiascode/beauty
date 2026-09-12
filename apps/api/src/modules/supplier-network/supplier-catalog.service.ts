import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

@Injectable()
export class SupplierCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(value: string) {
    return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async listProducts() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT cp.id,cp.slug,cp.name,cp.description,cp.category_code AS "categoryCode",cp.status,
              cb.id AS "brandId",cb.name AS "brandName",
              COUNT(cv.id)::int AS "variantCount"
       FROM catalog_products cp
       LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id
       LEFT JOIN catalog_variants cv ON cv.catalog_product_id=cp.id AND cv.status<>'ARCHIVED'
       WHERE cp.status<>'ARCHIVED'
       GROUP BY cp.id,cb.id,cb.name
       ORDER BY cp.name`,
    );
  }

  async listBrands() {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,slug,name,status,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM catalog_brands WHERE status<>'ARCHIVED' ORDER BY name`,
    );
  }

  async createBrand(input: { slug: string; name: string }) {
    const slug = this.slug(input.slug);
    const name = input.name.trim();
    if (!slug || !name) throw new BadRequestException('Brand slug and name are required.');
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM catalog_brands WHERE slug=$1 LIMIT 1`, slug);
    if (existing.length) throw new BadRequestException('Brand slug already exists.');
    return (await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO catalog_brands(slug,name) VALUES($1,$2)
       RETURNING id,slug,name,status,created_at AS "createdAt"`, slug, name,
    ))[0];
  }

  async createProduct(input: { brandId?: string; slug: string; name: string; description?: string; categoryCode?: string }) {
    const slug = this.slug(input.slug);
    const name = input.name.trim();
    if (!slug || !name) throw new BadRequestException('Product slug and name are required.');
    if (input.brandId) {
      const brand = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM catalog_brands WHERE id=$1::text AND status='ACTIVE' LIMIT 1`, input.brandId);
      if (!brand.length) throw new NotFoundException('Active catalog brand not found.');
    }
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM catalog_products WHERE slug=$1 LIMIT 1`, slug);
    if (existing.length) throw new BadRequestException('Catalog product slug already exists.');
    return (await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO catalog_products(brand_id,slug,name,description,category_code)
       VALUES($1::text,$2,$3,$4,$5)
       RETURNING id,brand_id AS "brandId",slug,name,description,category_code AS "categoryCode",status`,
      input.brandId ?? null, slug, name, input.description?.trim() || null, input.categoryCode?.trim() || null,
    ))[0];
  }

  async createVariant(productId: string, input: { name: string; canonicalSku?: string; unit?: string; attributes?: Record<string, unknown> }) {
    const product = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM catalog_products WHERE id=$1::text AND status='ACTIVE' LIMIT 1`, productId);
    if (!product.length) throw new NotFoundException('Active catalog product not found.');
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Variant name is required.');
    return (await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO catalog_variants(catalog_product_id,canonical_sku,name,unit,attributes)
       VALUES($1::text,$2,$3,$4,$5::jsonb)
       RETURNING id,catalog_product_id AS "catalogProductId",canonical_sku AS "canonicalSku",name,unit,attributes,status`,
      productId, input.canonicalSku?.trim() || null, name, input.unit ?? 'UNIT', JSON.stringify(input.attributes ?? {}),
    ))[0];
  }

  async addIdentifier(variantId: string, input: { type: string; value: string }) {
    const variant = await this.prisma.$queryRawUnsafe<any[]>(`SELECT id FROM catalog_variants WHERE id=$1::text AND status='ACTIVE' LIMIT 1`, variantId);
    if (!variant.length) throw new NotFoundException('Active catalog variant not found.');
    const value = input.value.trim();
    if (!value) throw new BadRequestException('Identifier value is required.');
    return (await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO catalog_product_identifiers(catalog_variant_id,identifier_type,identifier_value)
       VALUES($1::text,$2,$3)
       RETURNING id,catalog_variant_id AS "catalogVariantId",identifier_type AS "identifierType",identifier_value AS "identifierValue"`,
      variantId, input.type, value,
    ))[0];
  }
}
