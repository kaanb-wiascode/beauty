import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import type { SupplierPortalPrincipal } from './supplier-portal-auth.service';

@Injectable()
export class SupplierQuoteDefaultsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(principal: SupplierPortalPrincipal, rfqId: string) {
    const invitation = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT rs.id
       FROM procurement_rfq_suppliers rs
       JOIN procurement_rfqs r ON r.id=rs.rfq_id
       WHERE r.id=$1::text
         AND rs.supplier_organization_id=$2::text
         AND r.status<>'DRAFT'
       LIMIT 1`,
      rfqId,
      principal.supplierOrganizationId,
    );
    if (!invitation.length) {
      throw new NotFoundException('Supplier RFQ invitation not found');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ri.id AS "rfqItemId",ri.catalog_variant_id AS "catalogVariantId",
              so.id AS "supplierOfferId",so.currency,
              so.unit_price AS "unitPrice",so.available_quantity AS "availableQuantity",
              so.lead_time_days AS "leadTimeDays",so.minimum_order_quantity AS "minimumOrderQuantity",
              so.order_multiple AS "orderMultiple",so.valid_from AS "validFrom",so.valid_to AS "validTo"
       FROM procurement_rfq_items ri
       LEFT JOIN supplier_offers so
         ON so.catalog_variant_id=ri.catalog_variant_id
        AND so.supplier_organization_id=$2::text
        AND so.status='ACTIVE'
        AND (so.valid_from IS NULL OR so.valid_from<=NOW())
        AND (so.valid_to IS NULL OR so.valid_to>NOW())
       WHERE ri.rfq_id=$1::text
       ORDER BY ri.id`,
      rfqId,
      principal.supplierOrganizationId,
    );

    return rows.map((row) => ({
      ...row,
      hasActiveCatalogOffer: Boolean(row.supplierOfferId),
    }));
  }
}
