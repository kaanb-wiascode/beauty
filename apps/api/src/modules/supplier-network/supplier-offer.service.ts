import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import type { SupplierPortalPrincipal } from './supplier-portal-auth.service';

export interface SupplierOfferInput {
  catalogVariantId: string;
  supplierSku?: string;
  currency?: string;
  unitPrice: number;
  minimumOrderQuantity?: number;
  orderMultiple?: number;
  availableQuantity?: number | null;
  leadTimeDays?: number;
  preparationDays?: number;
  shippingDays?: number;
  validFrom?: Date | null;
  validTo?: Date | null;
}

export interface SupplierOfferUpdateInput extends Omit<SupplierOfferInput, 'catalogVariantId'> {
  expectedVersion: number;
}

@Injectable()
export class SupplierOfferService {
  constructor(private readonly prisma: PrismaService) {}

  private validateCommercial(input: Omit<SupplierOfferInput, 'catalogVariantId'>) {
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new BadRequestException('Unit price must be zero or greater.');
    if (!Number.isFinite(input.minimumOrderQuantity ?? 1) || Number(input.minimumOrderQuantity ?? 1) <= 0) throw new BadRequestException('Minimum order quantity must be greater than zero.');
    if (!Number.isFinite(input.orderMultiple ?? 1) || Number(input.orderMultiple ?? 1) <= 0) throw new BadRequestException('Order multiple must be greater than zero.');
    if (input.availableQuantity != null && (!Number.isFinite(input.availableQuantity) || input.availableQuantity < 0)) throw new BadRequestException('Available quantity cannot be negative.');
    for (const value of [input.leadTimeDays ?? 0, input.preparationDays ?? 0, input.shippingDays ?? 0]) {
      if (!Number.isInteger(value) || value < 0) throw new BadRequestException('Lead, preparation and shipping days must be non-negative integers.');
    }
    if (input.validFrom && input.validTo && input.validTo <= input.validFrom) throw new BadRequestException('Offer validity end must be after start.');
  }

  async list(principal: SupplierPortalPrincipal) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT so.id,so.catalog_variant_id AS "catalogVariantId",so.supplier_sku AS "supplierSku",
              so.currency,so.unit_price AS "unitPrice",so.minimum_order_quantity AS "minimumOrderQuantity",
              so.order_multiple AS "orderMultiple",so.available_quantity AS "availableQuantity",
              so.lead_time_days AS "leadTimeDays",so.preparation_days AS "preparationDays",so.shipping_days AS "shippingDays",
              so.valid_from AS "validFrom",so.valid_to AS "validTo",so.status,so.version,
              cp.name AS "productName",cv.name AS "variantName",cv.canonical_sku AS "canonicalSku",cb.name AS "brandName",
              so.created_at AS "createdAt",so.updated_at AS "updatedAt"
       FROM supplier_offers so
       JOIN catalog_variants cv ON cv.id=so.catalog_variant_id
       JOIN catalog_products cp ON cp.id=cv.catalog_product_id
       LEFT JOIN catalog_brands cb ON cb.id=cp.brand_id
       WHERE so.supplier_organization_id=$1::text AND so.status<>'ARCHIVED'
       ORDER BY cp.name,cv.name`,
      principal.supplierOrganizationId,
    );
  }

  async create(principal: SupplierPortalPrincipal, input: SupplierOfferInput) {
    this.validateCommercial(input);
    return this.prisma.$transaction(async (tx) => {
      const variants = await tx.$queryRawUnsafe<any[]>(
        `SELECT cv.id FROM catalog_variants cv
         JOIN catalog_products cp ON cp.id=cv.catalog_product_id
         WHERE cv.id=$1::text AND cv.status='ACTIVE' AND cp.status='ACTIVE' LIMIT 1`,
        input.catalogVariantId,
      );
      if (!variants.length) throw new NotFoundException('Active catalog variant not found.');
      const existing = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM supplier_offers WHERE supplier_organization_id=$1::text AND catalog_variant_id=$2::text LIMIT 1`,
        principal.supplierOrganizationId,
        input.catalogVariantId,
      );
      if (existing.length) throw new BadRequestException('Supplier already has an offer for this catalog variant.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO supplier_offers(
           supplier_organization_id,catalog_variant_id,supplier_sku,currency,unit_price,
           minimum_order_quantity,order_multiple,available_quantity,lead_time_days,preparation_days,shipping_days,
           valid_from,valid_to,created_by_supplier_membership_id,updated_by_supplier_membership_id
         ) VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::text,$14::text)
         RETURNING id,status,version,catalog_variant_id AS "catalogVariantId",unit_price AS "unitPrice"`,
        principal.supplierOrganizationId,
        input.catalogVariantId,
        input.supplierSku?.trim() || null,
        (input.currency ?? 'TRY').toUpperCase(),
        input.unitPrice,
        input.minimumOrderQuantity ?? 1,
        input.orderMultiple ?? 1,
        input.availableQuantity ?? null,
        input.leadTimeDays ?? 0,
        input.preparationDays ?? 0,
        input.shippingDays ?? 0,
        input.validFrom ?? null,
        input.validTo ?? null,
        principal.supplierMembershipId,
      );
      const offer = rows[0];
      await tx.$executeRawUnsafe(
        `INSERT INTO supplier_offer_events(supplier_offer_id,supplier_organization_id,actor_supplier_membership_id,event_type,to_status,to_version,metadata)
         VALUES($1::text,$2::text,$3::text,'CREATED','DRAFT',1,$4::jsonb)`,
        offer.id,
        principal.supplierOrganizationId,
        principal.supplierMembershipId,
        JSON.stringify({ catalogVariantId: input.catalogVariantId }),
      );
      return offer;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(principal: SupplierPortalPrincipal, id: string, input: SupplierOfferUpdateInput) {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) throw new BadRequestException('Expected version must be a positive integer.');
    this.validateCommercial(input);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,status,version FROM supplier_offers
         WHERE id=$1::text AND supplier_organization_id=$2::text FOR UPDATE`,
        id,
        principal.supplierOrganizationId,
      );
      if (!rows.length) throw new NotFoundException('Supplier offer not found.');
      const current = rows[0];
      if (current.status === 'ARCHIVED') throw new BadRequestException('Archived supplier offer cannot be updated.');
      if (Number(current.version) !== input.expectedVersion) throw new BadRequestException('Supplier offer changed concurrently.');
      const nextVersion = Number(current.version) + 1;
      const updated = await tx.$queryRawUnsafe<any[]>(
        `UPDATE supplier_offers SET
           supplier_sku=$3,currency=$4,unit_price=$5,minimum_order_quantity=$6,order_multiple=$7,
           available_quantity=$8,lead_time_days=$9,preparation_days=$10,shipping_days=$11,
           valid_from=$12,valid_to=$13,version=$14,updated_by_supplier_membership_id=$15::text,updated_at=NOW()
         WHERE id=$1::text AND supplier_organization_id=$2::text AND version=$16
         RETURNING id,status,version,unit_price AS "unitPrice"`,
        id,
        principal.supplierOrganizationId,
        input.supplierSku?.trim() || null,
        (input.currency ?? 'TRY').toUpperCase(),
        input.unitPrice,
        input.minimumOrderQuantity ?? 1,
        input.orderMultiple ?? 1,
        input.availableQuantity ?? null,
        input.leadTimeDays ?? 0,
        input.preparationDays ?? 0,
        input.shippingDays ?? 0,
        input.validFrom ?? null,
        input.validTo ?? null,
        nextVersion,
        principal.supplierMembershipId,
        input.expectedVersion,
      );
      if (!updated.length) throw new BadRequestException('Supplier offer changed concurrently.');
      await tx.$executeRawUnsafe(
        `INSERT INTO supplier_offer_events(supplier_offer_id,supplier_organization_id,actor_supplier_membership_id,event_type,from_status,to_status,from_version,to_version,metadata)
         VALUES($1::text,$2::text,$3::text,'UPDATED',$4,$4,$5,$6,$7::jsonb)`,
        id,
        principal.supplierOrganizationId,
        principal.supplierMembershipId,
        current.status,
        current.version,
        nextVersion,
        JSON.stringify({ fields: ['supplierSku','currency','unitPrice','minimumOrderQuantity','orderMultiple','availableQuantity','leadTimeDays','preparationDays','shippingDays','validFrom','validTo'] }),
      );
      return updated[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transition(principal: SupplierPortalPrincipal, id: string, expectedVersion: number, target: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') {
    if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) throw new BadRequestException('Expected version must be a positive integer.');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT so.id,so.status,so.version,org.verification_status AS "verificationStatus"
         FROM supplier_offers so
         JOIN supplier_organizations org ON org.id=so.supplier_organization_id
         WHERE so.id=$1::text AND so.supplier_organization_id=$2::text FOR UPDATE OF so`,
        id,
        principal.supplierOrganizationId,
      );
      if (!rows.length) throw new NotFoundException('Supplier offer not found.');
      const current = rows[0];
      if (Number(current.version) !== expectedVersion) throw new BadRequestException('Supplier offer changed concurrently.');
      const allowed: Record<string, string[]> = { DRAFT: ['ACTIVE','ARCHIVED'], ACTIVE: ['INACTIVE'], INACTIVE: ['ACTIVE','ARCHIVED'], ARCHIVED: [] };
      if (!(allowed[current.status] ?? []).includes(target)) throw new BadRequestException(`Supplier offer cannot transition from ${current.status} to ${target}.`);
      if (target === 'ACTIVE' && current.verificationStatus !== 'VERIFIED') throw new ForbiddenException('Supplier organization must be verified before activating offers.');
      const nextVersion = Number(current.version) + 1;
      const updated = await tx.$queryRawUnsafe<any[]>(
        `UPDATE supplier_offers SET status=$3,version=$4,updated_by_supplier_membership_id=$5::text,updated_at=NOW()
         WHERE id=$1::text AND supplier_organization_id=$2::text AND version=$6
         RETURNING id,status,version`,
        id,
        principal.supplierOrganizationId,
        target,
        nextVersion,
        principal.supplierMembershipId,
        expectedVersion,
      );
      if (!updated.length) throw new BadRequestException('Supplier offer changed concurrently.');
      const eventType = target === 'ACTIVE' ? 'ACTIVATED' : target === 'INACTIVE' ? 'DEACTIVATED' : 'ARCHIVED';
      await tx.$executeRawUnsafe(
        `INSERT INTO supplier_offer_events(supplier_offer_id,supplier_organization_id,actor_supplier_membership_id,event_type,from_status,to_status,from_version,to_version)
         VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8)`,
        id, principal.supplierOrganizationId, principal.supplierMembershipId, eventType, current.status, target, current.version, nextVersion,
      );
      return updated[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
