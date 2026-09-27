import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmDataScopeService } from './crm-data-scope.service';
import { SalesService } from '../sales/sales.service';
import type { CreateCrmQuoteInput, UpdateCrmQuoteStatusInput } from './crm-quote.schemas';

@Injectable()
export class CrmQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly dataScope: CrmDataScopeService,
    private readonly salesService: SalesService,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('Teklif işlemi için aktif bir şube seçilmelidir.');
    return branchId;
  }

  private async nextQuoteNumber() {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ seq: number }>>(
      `SELECT (COUNT(*) + 1)::int AS seq
         FROM crm_quotes
        WHERE tenant_id=$1::text AND company_id=$2::text`,
      context.tenantId,
      context.companyId,
    );
    const seq = rows[0]?.seq ?? 1;
    return `TKL-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
  }

  async list(opportunityId?: string) {
    const context = this.context();
    const visibility = await this.dataScope.resolve();
    return this.prisma.$queryRawUnsafe(
      `SELECT q.id,q.opportunity_id AS "opportunityId",q.customer_id AS "customerId",
              q.owner_user_id AS "ownerUserId",q.quote_number AS "quoteNumber",q.status,q.currency,
              q.subtotal,q.discount_total AS "discountTotal",q.total,q.valid_until AS "validUntil",
              q.sent_at AS "sentAt",q.viewed_at AS "viewedAt",q.accepted_at AS "acceptedAt",
              q.rejected_at AS "rejectedAt",q.sale_id AS "saleId",q.converted_at AS "convertedAt",
              q.notes,q.version,q.created_at AS "createdAt",q.updated_at AS "updatedAt"
         FROM crm_quotes q
        WHERE q.tenant_id=$1::text AND q.company_id=$2::text
          AND ($3::text IS NULL OR q.branch_id=$3::text)
          AND ($4::text IS NULL OR q.opportunity_id=$4::text)
          AND ($5::boolean=FALSE OR q.owner_user_id=ANY($6::text[]))
        ORDER BY q.created_at DESC,q.id DESC`,
      context.tenantId,
      context.companyId,
      context.branchId,
      opportunityId ?? null,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );
  }

  async get(id: string) {
    const context = this.context();
    const visibility = await this.dataScope.resolve();
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT q.id,q.opportunity_id AS "opportunityId",q.customer_id AS "customerId",
              q.owner_user_id AS "ownerUserId",q.quote_number AS "quoteNumber",q.status,q.currency,
              q.subtotal,q.discount_total AS "discountTotal",q.total,q.valid_until AS "validUntil",
              q.sent_at AS "sentAt",q.viewed_at AS "viewedAt",q.accepted_at AS "acceptedAt",
              q.rejected_at AS "rejectedAt",q.sale_id AS "saleId",q.converted_at AS "convertedAt",
              q.notes,q.version,q.created_at AS "createdAt",q.updated_at AS "updatedAt"
         FROM crm_quotes q
        WHERE q.id=$1::text AND q.tenant_id=$2::text AND q.company_id=$3::text
          AND ($4::text IS NULL OR q.branch_id=$4::text)
          AND ($5::boolean=FALSE OR q.owner_user_id=ANY($6::text[]))
        LIMIT 1`,
      id,
      context.tenantId,
      context.companyId,
      context.branchId,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );
    if (!rows.length) throw new NotFoundException('Teklif bulunamadı.');

    const items = await this.prisma.$queryRawUnsafe(
      `SELECT id,item_type AS "itemType",reference_id AS "referenceId",description,quantity,
              unit_price AS "unitPrice",line_total AS "lineTotal"
         FROM crm_quote_items
        WHERE quote_id=$1::text
        ORDER BY created_at,id`,
      id,
    );
    return { ...rows[0], items };
  }

  async create(input: CreateCrmQuoteInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    await this.dataScope.assertOpportunityAccess(input.opportunityId);

    const opportunityRows = await this.prisma.$queryRawUnsafe<Array<{
      customerId: string | null;
      ownerUserId: string | null;
    }>>(
      `SELECT customer_id AS "customerId",owner_user_id AS "ownerUserId"
         FROM crm_opportunities
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
        LIMIT 1`,
      input.opportunityId,
      context.tenantId,
      context.companyId,
      branchId,
    );
    const opportunity = opportunityRows[0];
    if (!opportunity) throw new NotFoundException('Satış fırsatı bulunamadı.');

    const ownerUserId = input.ownerUserId ?? opportunity.ownerUserId ?? actorUserId;
    await this.dataScope.assertOwnerAllowed(ownerUserId);

    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (input.discountTotal > subtotal) {
      throw new BadRequestException('İndirim toplamı teklif ara toplamını aşamaz.');
    }
    const total = Math.round((subtotal - input.discountTotal + Number.EPSILON) * 100) / 100;
    const quoteNumber = await this.nextQuoteNumber();

    const quoteId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO crm_quotes(
           tenant_id,company_id,branch_id,opportunity_id,customer_id,owner_user_id,quote_number,
           currency,subtotal,discount_total,total,valid_until,notes,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14::text)
         RETURNING id`,
        context.tenantId,
        context.companyId,
        branchId,
        input.opportunityId,
        input.customerId ?? opportunity.customerId ?? null,
        ownerUserId,
        quoteNumber,
        input.currency,
        subtotal,
        input.discountTotal,
        total,
        input.validUntil ?? null,
        input.notes ?? null,
        actorUserId,
      );
      const createdQuoteId = rows[0].id;

      for (const item of input.items) {
        const lineTotal = Math.round((item.quantity * item.unitPrice + Number.EPSILON) * 100) / 100;
        await tx.$executeRawUnsafe(
          `INSERT INTO crm_quote_items(quote_id,item_type,reference_id,description,quantity,unit_price,line_total)
           VALUES($1::text,$2,$3::text,$4,$5,$6,$7)`,
          createdQuoteId,
          item.itemType,
          item.referenceId ?? null,
          item.description,
          item.quantity,
          item.unitPrice,
          lineTotal,
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,customer_id,opportunity_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'QUOTE_CREATED',$6::text,$7::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        input.customerId ?? opportunity.customerId ?? null,
        input.opportunityId,
        actorUserId,
        JSON.stringify({ quoteId: createdQuoteId, quoteNumber, subtotal, discountTotal: input.discountTotal, total }),
      );

      return createdQuoteId;
    });

    return this.get(quoteId);
  }

  async convertToSale(id: string, actorUserId: string) {
    const quote = await this.get(id) as {
      opportunityId: string;
      customerId: string | null;
      status: string;
      discountTotal: number | string;
      items: Array<{
        itemType: 'SERVICE' | 'PACKAGE' | 'CUSTOM';
        referenceId: string | null;
        quantity: number;
      }>;
    };

    if (quote.status !== 'ACCEPTED') {
      throw new BadRequestException('Yalnızca kabul edilmiş teklifler satışa dönüştürülebilir.');
    }

    const unsupported = quote.items.find((item) => item.itemType === 'CUSTOM' || !item.referenceId);
    if (unsupported) {
      throw new BadRequestException('Satışa dönüştürmeden önce tüm teklif kalemlerini hizmet veya paket ile eşleştirin.');
    }

    const context = this.context();
    const opportunityRows = await this.prisma.$queryRawUnsafe<Array<{
      version: number;
      stage: string;
      saleId: string | null;
    }>>(
      `SELECT version,stage,sale_id AS "saleId"
         FROM crm_opportunities
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id=$4::text)
        LIMIT 1`,
      quote.opportunityId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    const opportunity = opportunityRows[0];
    if (!opportunity) throw new NotFoundException('Satış fırsatı bulunamadı.');
    if (opportunity.saleId) {
      return { saleId: opportunity.saleId, idempotent: true };
    }
    if (opportunity.stage !== 'WON') {
      throw new BadRequestException('Teklifi satışa dönüştürmeden önce satış fırsatını Kazanıldı aşamasına taşıyın.');
    }

    const conversion = await this.salesService.createFromOpportunity(
      quote.opportunityId,
      {
        version: opportunity.version,
        ...(quote.customerId ? { customerId: quote.customerId } : {}),
        discountTotal: Number(quote.discountTotal ?? 0),
        items: quote.items.map((item) => ({
          type: item.itemType as 'SERVICE' | 'PACKAGE',
          referenceId: item.referenceId!,
          quantity: Number(item.quantity),
        })),
      },
      actorUserId,
    );

    const saleId =
      'sale' in conversion && conversion.sale
        ? conversion.sale.id
        : 'saleId' in conversion
          ? conversion.saleId
          : null;
    if (!saleId) {
      throw new ConflictException('Satış bağlantısı oluşturulamadı.');
    }

    const convertedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE crm_quotes
            SET sale_id=$5::text,converted_at=$6::timestamptz,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,
        id,
        context.tenantId,
        context.companyId,
        context.branchId,
        saleId,
        convertedAt,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(
           tenant_id,company_id,branch_id,customer_id,opportunity_id,sale_id,event_type,actor_user_id,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'QUOTE_CONVERTED_TO_SALE',$7::text,$8::jsonb)`,
        context.tenantId,
        context.companyId,
        context.branchId,
        quote.customerId,
        quote.opportunityId,
        saleId,
        actorUserId,
        JSON.stringify({ quoteId: id, saleId, convertedAt: convertedAt.toISOString() }),
      );
    });

    return { saleId, convertedAt, idempotent: Boolean(conversion.idempotent) };
  }

  async updateStatus(id: string, input: UpdateCrmQuoteStatusInput, actorUserId: string) {
    const current = (await this.get(id)) as unknown as {
      opportunityId: string;
      status: string;
      version: number;
      customerId: string | null;
    };
    await this.dataScope.assertOpportunityAccess(current.opportunityId);

    const context = this.context();
    const branchId = this.requireBranchId();
    const now = new Date();

    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE crm_quotes SET
         status=$5,
         sent_at=CASE WHEN $5='SENT' THEN COALESCE(sent_at,$6::timestamptz) ELSE sent_at END,
         viewed_at=CASE WHEN $5='VIEWED' THEN COALESCE(viewed_at,$6::timestamptz) ELSE viewed_at END,
         accepted_at=CASE WHEN $5='ACCEPTED' THEN COALESCE(accepted_at,$6::timestamptz) ELSE accepted_at END,
         rejected_at=CASE WHEN $5='REJECTED' THEN COALESCE(rejected_at,$6::timestamptz) ELSE rejected_at END,
         version=version+1,updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND branch_id=$4::text AND version=$7
       RETURNING id,opportunity_id AS "opportunityId",customer_id AS "customerId",status,version`,
      id,
      context.tenantId,
      context.companyId,
      branchId,
      input.status,
      now,
      input.version,
    );

    if (!rows.length) throw new ConflictException('Teklif başka bir kullanıcı tarafından güncellendi. Sayfayı yenileyin.');

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_events(tenant_id,company_id,branch_id,customer_id,opportunity_id,event_type,actor_user_id,metadata)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'QUOTE_STATUS_CHANGED',$6::text,$7::jsonb)`,
      context.tenantId,
      context.companyId,
      branchId,
      current.customerId,
      current.opportunityId,
      actorUserId,
      JSON.stringify({ quoteId: id, previousStatus: current.status, status: input.status }),
    );

    return this.get(id);
  }
}
