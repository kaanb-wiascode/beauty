import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import type { SupplierPortalPrincipal } from './supplier-portal-auth.service';

export interface SaveSupplierQuoteInput {
  currency?: string;
  note?: string;
  validUntil?: Date | null;
  paymentTermsDays?: number | null;
  warrantyMonths?: number | null;
  installationIncluded?: boolean;
  trainingIncluded?: boolean;
  serviceSlaDays?: number | null;
  financingAvailable?: boolean;
  expectedVersion?: number;
  items: Array<{
    rfqItemId: string;
    unitPrice: number;
    availableQuantity?: number | null;
    leadTimeDays?: number;
    note?: string;
  }>;
}

@Injectable()
export class SupplierQuoteService {
  constructor(private readonly prisma: PrismaService) {}

  private commercialTerms(input: SaveSupplierQuoteInput) {
    return {
      paymentTermsDays: input.paymentTermsDays ?? null,
      warrantyMonths: input.warrantyMonths ?? null,
      installationIncluded: input.installationIncluded ?? false,
      trainingIncluded: input.trainingIncluded ?? false,
      serviceSlaDays: input.serviceSlaDays ?? null,
      financingAvailable: input.financingAvailable ?? false,
    };
  }

  async list(principal: SupplierPortalPrincipal) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.title,r.note,r.status,r.response_deadline AS "responseDeadline",
              r.published_at AS "publishedAt",r.closed_at AS "closedAt",
              w.name AS "warehouseName",
              rs.id AS "rfqSupplierId",rs.status AS "invitationStatus",
              sq.id AS "quoteId",sq.status AS "quoteStatus",sq.currency,
              sq.valid_until AS "validUntil",sq.version,sq.submitted_at AS "submittedAt",
              sq.payment_terms_days AS "paymentTermsDays",sq.warranty_months AS "warrantyMonths",
              sq.installation_included AS "installationIncluded",sq.training_included AS "trainingIncluded",
              sq.service_sla_days AS "serviceSlaDays",sq.financing_available AS "financingAvailable",
              COUNT(DISTINCT ri.id)::int AS "itemCount"
       FROM procurement_rfq_suppliers rs
       JOIN procurement_rfqs r ON r.id=rs.rfq_id
       JOIN inventory_warehouses w ON w.id=r.warehouse_id
       LEFT JOIN procurement_rfq_items ri ON ri.rfq_id=r.id
       LEFT JOIN supplier_quotes sq ON sq.rfq_supplier_id=rs.id
       WHERE rs.supplier_organization_id=$1::text
         AND r.status<>'DRAFT'
       GROUP BY r.id,w.name,rs.id,rs.status,sq.id
       ORDER BY r.created_at DESC`,
      principal.supplierOrganizationId,
    );
  }

  async get(principal: SupplierPortalPrincipal, rfqId: string) {
    return this.getTx(this.prisma, principal, rfqId);
  }

  private async getTx(
    tx: Prisma.TransactionClient | PrismaService,
    principal: SupplierPortalPrincipal,
    rfqId: string,
  ) {
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.title,r.note,r.status,r.response_deadline AS "responseDeadline",
              r.published_at AS "publishedAt",r.closed_at AS "closedAt",
              w.name AS "warehouseName",
              rs.id AS "rfqSupplierId",rs.status AS "invitationStatus",
              sq.id AS "quoteId",sq.status AS "quoteStatus",sq.currency,
              sq.note AS "quoteNote",sq.valid_until AS "validUntil",
              sq.payment_terms_days AS "paymentTermsDays",sq.warranty_months AS "warrantyMonths",
              sq.installation_included AS "installationIncluded",sq.training_included AS "trainingIncluded",
              sq.service_sla_days AS "serviceSlaDays",sq.financing_available AS "financingAvailable",
              sq.version,sq.submitted_at AS "submittedAt"
       FROM procurement_rfq_suppliers rs
       JOIN procurement_rfqs r ON r.id=rs.rfq_id
       JOIN inventory_warehouses w ON w.id=r.warehouse_id
       LEFT JOIN supplier_quotes sq ON sq.rfq_supplier_id=rs.id
       WHERE r.id=$1::text
         AND rs.supplier_organization_id=$2::text
         AND r.status<>'DRAFT'
       LIMIT 1`,
      rfqId,
      principal.supplierOrganizationId,
    );
    if (!rows.length) throw new NotFoundException('Supplier RFQ invitation not found');

    const items = await tx.$queryRawUnsafe<any[]>(
      `SELECT ri.id AS "rfqItemId",ri.quantity,ri.note,
              cp.name AS "catalogProductName",cv.name AS "catalogVariantName",
              cv.canonical_sku AS "canonicalSku",cv.unit,
              sqi.unit_price AS "unitPrice",sqi.available_quantity AS "availableQuantity",
              sqi.lead_time_days AS "leadTimeDays",sqi.note AS "quoteItemNote"
       FROM procurement_rfq_items ri
       JOIN catalog_variants cv ON cv.id=ri.catalog_variant_id
       JOIN catalog_products cp ON cp.id=cv.catalog_product_id
       LEFT JOIN supplier_quotes sq
         ON sq.rfq_id=ri.rfq_id AND sq.supplier_organization_id=$2::text
       LEFT JOIN supplier_quote_items sqi
         ON sqi.supplier_quote_id=sq.id AND sqi.rfq_item_id=ri.id
       WHERE ri.rfq_id=$1::text
       ORDER BY cp.name,cv.name`,
      rfqId,
      principal.supplierOrganizationId,
    );

    return { ...rows[0], items };
  }

  async save(
    principal: SupplierPortalPrincipal,
    rfqId: string,
    input: SaveSupplierQuoteInput,
  ) {
    if (!input.items.length) {
      throw new BadRequestException('Supplier quote must contain at least one item.');
    }
    if (new Set(input.items.map((item) => item.rfqItemId)).size !== input.items.length) {
      throw new BadRequestException('Each RFQ item can appear only once in a supplier quote.');
    }
    for (const value of [input.paymentTermsDays, input.warrantyMonths, input.serviceSlaDays]) {
      if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0)) {
        throw new BadRequestException('Commercial term durations must be non-negative integers.');
      }
    }
    const terms = this.commercialTerms(input);

    return this.prisma.$transaction(
      async (tx) => {
        const invitations = await tx.$queryRawUnsafe<any[]>(
          `SELECT rs.id AS "rfqSupplierId",r.status,r.response_deadline AS "responseDeadline"
           FROM procurement_rfq_suppliers rs
           JOIN procurement_rfqs r ON r.id=rs.rfq_id
           WHERE r.id=$1::text AND rs.supplier_organization_id=$2::text
           FOR UPDATE OF rs`,
          rfqId,
          principal.supplierOrganizationId,
        );
        if (!invitations.length) throw new NotFoundException('Supplier RFQ invitation not found');
        const invitation = invitations[0];
        if (invitation.status !== 'PUBLISHED') {
          throw new BadRequestException('Supplier quotes can only be edited while the RFQ is published.');
        }
        if (
          invitation.responseDeadline &&
          new Date(invitation.responseDeadline).getTime() <= Date.now()
        ) {
          throw new BadRequestException('RFQ response deadline has passed.');
        }

        const rfqItems = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM procurement_rfq_items WHERE rfq_id=$1::text`,
          rfqId,
        );
        const allowedItemIds = new Set(rfqItems.map((item) => item.id as string));
        if (input.items.some((item) => !allowedItemIds.has(item.rfqItemId))) {
          throw new BadRequestException('Supplier quote contains an item outside the RFQ.');
        }
        for (const item of input.items) {
          if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
            throw new BadRequestException('Quote unit price must be zero or greater.');
          }
          if (
            item.availableQuantity !== undefined &&
            item.availableQuantity !== null &&
            (!Number.isFinite(item.availableQuantity) || item.availableQuantity < 0)
          ) {
            throw new BadRequestException('Available quantity must be zero or greater.');
          }
          if (
            item.leadTimeDays !== undefined &&
            (!Number.isInteger(item.leadTimeDays) || item.leadTimeDays < 0)
          ) {
            throw new BadRequestException('Lead time days must be a non-negative integer.');
          }
        }

        const existing = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status,version
           FROM supplier_quotes
           WHERE rfq_supplier_id=$1::text
           FOR UPDATE`,
          invitation.rfqSupplierId,
        );

        let quoteId: string;
        let newVersion: number;
        if (!existing.length) {
          if (input.expectedVersion !== undefined) {
            throw new BadRequestException('Expected version must be omitted when creating a quote.');
          }
          const created = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO supplier_quotes(
               rfq_id,rfq_supplier_id,supplier_organization_id,currency,note,valid_until,
               payment_terms_days,warranty_months,installation_included,training_included,
               service_sla_days,financing_available,
               created_by_supplier_membership_id,updated_by_supplier_membership_id
             ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text,$13::text)
             RETURNING id,version`,
            rfqId,
            invitation.rfqSupplierId,
            principal.supplierOrganizationId,
            (input.currency ?? 'TRY').trim().toUpperCase(),
            input.note?.trim() || null,
            input.validUntil ?? null,
            terms.paymentTermsDays,
            terms.warrantyMonths,
            terms.installationIncluded,
            terms.trainingIncluded,
            terms.serviceSlaDays,
            terms.financingAvailable,
            principal.supplierMembershipId,
          );
          quoteId = created[0].id;
          newVersion = Number(created[0].version);
          await tx.$executeRawUnsafe(
            `INSERT INTO supplier_quote_events(
               supplier_quote_id,supplier_organization_id,actor_supplier_membership_id,
               event_type,to_status,to_version,metadata
             ) VALUES($1::text,$2::text,$3::text,'CREATED','DRAFT',$4,$5::jsonb)`,
            quoteId,
            principal.supplierOrganizationId,
            principal.supplierMembershipId,
            newVersion,
            JSON.stringify({ commercialTerms: terms }),
          );
        } else {
          const quote = existing[0];
          if (quote.status !== 'DRAFT') {
            throw new BadRequestException('Only draft supplier quotes can be edited.');
          }
          if (input.expectedVersion !== Number(quote.version)) {
            throw new BadRequestException('Supplier quote version changed concurrently.');
          }
          quoteId = quote.id;
          newVersion = Number(quote.version) + 1;
          const updated = await tx.$executeRawUnsafe(
            `UPDATE supplier_quotes
             SET currency=$2,note=$3,valid_until=$4,
                 payment_terms_days=$5,warranty_months=$6,installation_included=$7,training_included=$8,
                 service_sla_days=$9,financing_available=$10,version=version+1,
                 updated_by_supplier_membership_id=$11::text,updated_at=NOW()
             WHERE id=$1::text AND version=$12 AND status='DRAFT'`,
            quoteId,
            (input.currency ?? 'TRY').trim().toUpperCase(),
            input.note?.trim() || null,
            input.validUntil ?? null,
            terms.paymentTermsDays,
            terms.warrantyMonths,
            terms.installationIncluded,
            terms.trainingIncluded,
            terms.serviceSlaDays,
            terms.financingAvailable,
            principal.supplierMembershipId,
            Number(quote.version),
          );
          if (updated !== 1) {
            throw new BadRequestException('Supplier quote changed concurrently.');
          }
          await tx.$executeRawUnsafe(
            `DELETE FROM supplier_quote_items WHERE supplier_quote_id=$1::text`,
            quoteId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO supplier_quote_events(
               supplier_quote_id,supplier_organization_id,actor_supplier_membership_id,
               event_type,from_status,to_status,from_version,to_version,metadata
             ) VALUES($1::text,$2::text,$3::text,'UPDATED','DRAFT','DRAFT',$4,$5,$6::jsonb)`,
            quoteId,
            principal.supplierOrganizationId,
            principal.supplierMembershipId,
            Number(quote.version),
            newVersion,
            JSON.stringify({ commercialTerms: terms }),
          );
        }

        for (const item of input.items) {
          await tx.$executeRawUnsafe(
            `INSERT INTO supplier_quote_items(
               supplier_quote_id,rfq_item_id,unit_price,available_quantity,lead_time_days,note
             ) VALUES($1::text,$2::text,$3,$4,$5,$6)`,
            quoteId,
            item.rfqItemId,
            item.unitPrice,
            item.availableQuantity ?? null,
            item.leadTimeDays ?? 0,
            item.note?.trim() || null,
          );
        }

        return this.getTx(tx, principal, rfqId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async submit(
    principal: SupplierPortalPrincipal,
    rfqId: string,
    expectedVersion: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT sq.id,sq.status,sq.version,r.status AS "rfqStatus",
                  r.response_deadline AS "responseDeadline",
                  (SELECT COUNT(*)::int FROM procurement_rfq_items WHERE rfq_id=r.id) AS "rfqItemCount",
                  (SELECT COUNT(*)::int FROM supplier_quote_items WHERE supplier_quote_id=sq.id) AS "quoteItemCount"
           FROM supplier_quotes sq
           JOIN procurement_rfq_suppliers rs ON rs.id=sq.rfq_supplier_id
           JOIN procurement_rfqs r ON r.id=sq.rfq_id
           WHERE sq.rfq_id=$1::text AND sq.supplier_organization_id=$2::text
           FOR UPDATE OF sq,rs,r`,
          rfqId,
          principal.supplierOrganizationId,
        );
        if (!rows.length) throw new NotFoundException('Supplier quote not found');
        const quote = rows[0];
        if (quote.status !== 'DRAFT' || quote.rfqStatus !== 'PUBLISHED') {
          throw new BadRequestException('Only draft quotes for published RFQs can be submitted.');
        }
        if (Number(quote.version) !== expectedVersion) {
          throw new BadRequestException('Supplier quote version changed concurrently.');
        }
        if (Number(quote.quoteItemCount) !== Number(quote.rfqItemCount)) {
          throw new BadRequestException('Every RFQ item must be priced before quote submission.');
        }
        if (
          quote.responseDeadline &&
          new Date(quote.responseDeadline).getTime() <= Date.now()
        ) {
          throw new BadRequestException('RFQ response deadline has passed.');
        }

        const updated = await tx.$executeRawUnsafe(
          `UPDATE supplier_quotes
           SET status='SUBMITTED',version=version+1,submitted_at=NOW(),
               updated_by_supplier_membership_id=$3::text,updated_at=NOW()
           WHERE id=$1::text AND version=$2 AND status='DRAFT'`,
          quote.id,
          expectedVersion,
          principal.supplierMembershipId,
        );
        if (updated !== 1) throw new BadRequestException('Supplier quote changed concurrently.');
        await tx.$executeRawUnsafe(
          `UPDATE procurement_rfq_suppliers
           SET status='RESPONDED',responded_at=NOW()
           WHERE id=(SELECT rfq_supplier_id FROM supplier_quotes WHERE id=$1::text)`,
          quote.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_quote_events(
             supplier_quote_id,supplier_organization_id,actor_supplier_membership_id,
             event_type,from_status,to_status,from_version,to_version
           ) VALUES($1::text,$2::text,$3::text,'SUBMITTED','DRAFT','SUBMITTED',$4,$5)`,
          quote.id,
          principal.supplierOrganizationId,
          principal.supplierMembershipId,
          expectedVersion,
          expectedVersion + 1,
        );
        return this.getTx(tx, principal, rfqId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async withdraw(
    principal: SupplierPortalPrincipal,
    rfqId: string,
    expectedVersion: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT sq.id,sq.status,sq.version,r.status AS "rfqStatus",
                  r.response_deadline AS "responseDeadline"
           FROM supplier_quotes sq
           JOIN procurement_rfqs r ON r.id=sq.rfq_id
           WHERE sq.rfq_id=$1::text AND sq.supplier_organization_id=$2::text
           FOR UPDATE OF sq,r`,
          rfqId,
          principal.supplierOrganizationId,
        );
        if (!rows.length) throw new NotFoundException('Supplier quote not found');
        const quote = rows[0];
        if (quote.status !== 'SUBMITTED' || quote.rfqStatus !== 'PUBLISHED') {
          throw new BadRequestException('Only submitted quotes for published RFQs can be withdrawn.');
        }
        if (Number(quote.version) !== expectedVersion) {
          throw new BadRequestException('Supplier quote version changed concurrently.');
        }
        if (
          quote.responseDeadline &&
          new Date(quote.responseDeadline).getTime() <= Date.now()
        ) {
          throw new BadRequestException('RFQ response deadline has passed.');
        }

        const updated = await tx.$executeRawUnsafe(
          `UPDATE supplier_quotes
           SET status='WITHDRAWN',version=version+1,
               updated_by_supplier_membership_id=$3::text,updated_at=NOW()
           WHERE id=$1::text AND version=$2 AND status='SUBMITTED'`,
          quote.id,
          expectedVersion,
          principal.supplierMembershipId,
        );
        if (updated !== 1) throw new BadRequestException('Supplier quote changed concurrently.');
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_quote_events(
             supplier_quote_id,supplier_organization_id,actor_supplier_membership_id,
             event_type,from_status,to_status,from_version,to_version
           ) VALUES($1::text,$2::text,$3::text,'WITHDRAWN','SUBMITTED','WITHDRAWN',$4,$5)`,
          quote.id,
          principal.supplierOrganizationId,
          principal.supplierMembershipId,
          expectedVersion,
          expectedVersion + 1,
        );
        return this.getTx(tx, principal, rfqId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
