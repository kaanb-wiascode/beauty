import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateLeadInput, UpdateLeadInput } from './crm.schemas';

interface CrmLeadRow {
  id: string;
  [key: string]: unknown;
}

@Injectable()
export class CrmLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('CRM mutation requires an active branch.');
    return branchId;
  }

  private async assertAssignableUser(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const context = this.context();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text AND m.status='ACTIVE'
         AND ($4::text IS NULL OR r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         )) LIMIT 1`,
      userId, context.tenantId, context.companyId, context.branchId,
    );
    if (!rows.length) throw new BadRequestException('CRM assignee is not an active company member.');
  }

  private acquisitionSelect() {
    return `l.source,l.source_detail AS "sourceDetail",l.campaign_id AS "campaignId",l.campaign_name AS "campaignName",
            l.ad_set_id AS "adSetId",l.ad_set_name AS "adSetName",l.ad_id AS "adId",l.ad_name AS "adName",
            l.landing_page AS "landingPage",l.referrer,l.utm_source AS "utmSource",l.utm_medium AS "utmMedium",
            l.utm_campaign AS "utmCampaign",l.utm_content AS "utmContent",l.utm_term AS "utmTerm",
            l.click_identifiers AS "clickIdentifiers"`;
  }

  async list(filters: { status?: string; ownerUserId?: string; search?: string; limit?: number }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
      `SELECT l.id,l.first_name AS "firstName",l.last_name AS "lastName",l.phone,l.alternative_phone AS "alternativePhone",l.email,
              l.preferred_contact_channel AS "preferredContactChannel",l.language,l.timezone,
              ${this.acquisitionSelect()},l.status,l.interest_note AS "interestNote",l.customer_id AS "customerId",
              l.owner_user_id AS "ownerUserId",l.version,l.created_at AS "createdAt",l.updated_at AS "updatedAt",
              o.id AS "opportunityId",o.stage AS "opportunityStage",o.estimated_value AS "estimatedValue"
       FROM crm_leads l LEFT JOIN crm_opportunities o ON o.lead_id=l.id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text
         AND ($3::text IS NULL OR l.branch_id=$3::text)
         AND ($4::text IS NULL OR l.status=$4::text)
         AND ($5::text IS NULL OR l.owner_user_id=$5::text)
         AND ($6::text IS NULL OR concat_ws(' ',l.first_name,l.last_name,l.phone,l.alternative_phone,l.email,l.source,l.source_detail,l.campaign_name,l.ad_set_name,l.ad_name,l.utm_campaign) ILIKE '%' || $6 || '%')
       ORDER BY l.updated_at DESC,l.id LIMIT $7`,
      context.tenantId, context.companyId, context.branchId,
      filters.status ?? null, filters.ownerUserId ?? null, filters.search?.trim() || null, limit,
    );
  }

  async get(id: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
      `SELECT l.id,l.branch_id AS "branchId",l.first_name AS "firstName",l.last_name AS "lastName",
              l.phone,l.alternative_phone AS "alternativePhone",l.email,
              l.preferred_contact_channel AS "preferredContactChannel",l.language,l.timezone,
              ${this.acquisitionSelect()},l.status,l.interest_note AS "interestNote",l.lost_reason AS "lostReason",
              l.customer_id AS "customerId",l.owner_user_id AS "ownerUserId",l.version,
              l.created_at AS "createdAt",l.updated_at AS "updatedAt"
       FROM crm_leads l
       WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
         AND ($4::text IS NULL OR l.branch_id=$4::text) LIMIT 1`,
      id, context.tenantId, context.companyId, context.branchId,
    );
    if (!rows.length) throw new NotFoundException('CRM lead not found.');

    const [opportunities, followUps, events] = await Promise.all([
      this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
        `SELECT id,title,stage,estimated_value AS "estimatedValue",currency,probability,
                expected_close_date AS "expectedCloseDate",lost_reason AS "lostReason",version,
                created_at AS "createdAt",updated_at AS "updatedAt"
         FROM crm_opportunities WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        id, context.tenantId, context.companyId,
      ),
      this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
        `SELECT id,lead_id AS "leadId",opportunity_id AS "opportunityId",assigned_user_id AS "assignedUserId",
                channel,status,due_at AS "dueAt",note,outcome,completed_at AS "completedAt",
                cancelled_at AS "cancelledAt",cancellation_reason AS "cancellationReason",version,
                created_at AS "createdAt",updated_at AS "updatedAt"
         FROM crm_follow_ups WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY due_at,id`,
        id, context.tenantId, context.companyId,
      ),
      this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
        `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",metadata,created_at AS "createdAt"
         FROM crm_events WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY created_at,id`,
        id, context.tenantId, context.companyId,
      ),
    ]);
    return { ...rows[0], opportunities, followUps, events };
  }

  async create(input: CreateLeadInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId);

    return this.prisma.$transaction(async (tx) => {
      if (input.customerId) {
        const customers = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text LIMIT 1`,
          input.customerId, context.tenantId, branchId,
        );
        if (!customers.length) throw new BadRequestException('CRM customer is outside the active branch.');
      }

      const rows = await tx.$queryRawUnsafe<CrmLeadRow[]>(
        `INSERT INTO crm_leads(
           tenant_id,company_id,branch_id,customer_id,owner_user_id,first_name,last_name,phone,alternative_phone,email,
           preferred_contact_channel,language,timezone,source,source_detail,campaign_id,campaign_name,ad_set_id,ad_set_name,
           ad_id,ad_name,landing_page,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,click_identifiers,
           interest_note,created_by_user_id
         ) VALUES(
           $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
           $20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb,$30,$31::text
         )
         RETURNING id,first_name AS "firstName",last_name AS "lastName",phone,alternative_phone AS "alternativePhone",email,
                   preferred_contact_channel AS "preferredContactChannel",language,timezone,source,source_detail AS "sourceDetail",
                   campaign_id AS "campaignId",campaign_name AS "campaignName",ad_set_id AS "adSetId",ad_set_name AS "adSetName",
                   ad_id AS "adId",ad_name AS "adName",landing_page AS "landingPage",referrer,utm_source AS "utmSource",
                   utm_medium AS "utmMedium",utm_campaign AS "utmCampaign",utm_content AS "utmContent",utm_term AS "utmTerm",
                   click_identifiers AS "clickIdentifiers",status,interest_note AS "interestNote",
                   owner_user_id AS "ownerUserId",customer_id AS "customerId",version`,
        context.tenantId, context.companyId, branchId, input.customerId ?? null, input.ownerUserId ?? actorUserId,
        input.firstName, input.lastName, input.phone ?? null, input.alternativePhone ?? null, input.email?.toLowerCase() ?? null,
        input.preferredContactChannel ?? null, input.language ?? null, input.timezone ?? null, input.source,
        input.sourceDetail ?? null, input.campaignId ?? null, input.campaignName ?? null, input.adSetId ?? null, input.adSetName ?? null,
        input.adId ?? null, input.adName ?? null, input.landingPage ?? null, input.referrer ?? null,
        input.utmSource ?? null, input.utmMedium ?? null, input.utmCampaign ?? null, input.utmContent ?? null, input.utmTerm ?? null,
        JSON.stringify(input.clickIdentifiers ?? {}), input.interestNote ?? null, actorUserId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_CREATED',$5::text,$6::jsonb)`,
        context.tenantId, context.companyId, branchId, rows[0].id, actorUserId,
        JSON.stringify({ source: input.source, sourceDetail: input.sourceDetail, campaignId: input.campaignId,
          campaignName: input.campaignName, utmSource: input.utmSource, utmCampaign: input.utmCampaign }),
      );
      return rows[0];
    });
  }

  async update(id: string, input: UpdateLeadInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId);
    if (input.status === 'LOST' && !input.lostReason) throw new BadRequestException('Lost lead requires a reason.');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<CrmLeadRow[]>(
        `UPDATE crm_leads SET
           first_name=COALESCE($5,first_name),last_name=COALESCE($6,last_name),
           phone=CASE WHEN $7::boolean THEN $8 ELSE phone END,
           alternative_phone=CASE WHEN $9::boolean THEN $10 ELSE alternative_phone END,
           email=CASE WHEN $11::boolean THEN lower($12) ELSE email END,
           preferred_contact_channel=CASE WHEN $13::boolean THEN $14 ELSE preferred_contact_channel END,
           language=CASE WHEN $15::boolean THEN $16 ELSE language END,
           timezone=CASE WHEN $17::boolean THEN $18 ELSE timezone END,
           source=COALESCE($19,source),source_detail=CASE WHEN $20::boolean THEN $21 ELSE source_detail END,
           campaign_id=CASE WHEN $22::boolean THEN $23 ELSE campaign_id END,campaign_name=CASE WHEN $24::boolean THEN $25 ELSE campaign_name END,
           ad_set_id=CASE WHEN $26::boolean THEN $27 ELSE ad_set_id END,ad_set_name=CASE WHEN $28::boolean THEN $29 ELSE ad_set_name END,
           ad_id=CASE WHEN $30::boolean THEN $31 ELSE ad_id END,ad_name=CASE WHEN $32::boolean THEN $33 ELSE ad_name END,
           landing_page=CASE WHEN $34::boolean THEN $35 ELSE landing_page END,referrer=CASE WHEN $36::boolean THEN $37 ELSE referrer END,
           utm_source=CASE WHEN $38::boolean THEN $39 ELSE utm_source END,utm_medium=CASE WHEN $40::boolean THEN $41 ELSE utm_medium END,
           utm_campaign=CASE WHEN $42::boolean THEN $43 ELSE utm_campaign END,utm_content=CASE WHEN $44::boolean THEN $45 ELSE utm_content END,
           utm_term=CASE WHEN $46::boolean THEN $47 ELSE utm_term END,
           click_identifiers=CASE WHEN $48::boolean THEN $49::jsonb ELSE click_identifiers END,
           interest_note=CASE WHEN $50::boolean THEN $51 ELSE interest_note END,
           owner_user_id=CASE WHEN $52::boolean THEN $53::text ELSE owner_user_id END,
           status=COALESCE($54,status),lost_reason=CASE WHEN $54='LOST' THEN $55 ELSE NULL END,
           version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND ($4::text IS NULL OR branch_id=$4::text) AND version=$56
         RETURNING id,status,source,source_detail AS "sourceDetail",campaign_id AS "campaignId",campaign_name AS "campaignName",
                   utm_source AS "utmSource",utm_medium AS "utmMedium",utm_campaign AS "utmCampaign",
                   click_identifiers AS "clickIdentifiers",version,updated_at AS "updatedAt"`,
        id, context.tenantId, context.companyId, branchId,
        input.firstName ?? null, input.lastName ?? null,
        input.phone !== undefined, input.phone ?? null, input.alternativePhone !== undefined, input.alternativePhone ?? null,
        input.email !== undefined, input.email ?? null, input.preferredContactChannel !== undefined, input.preferredContactChannel ?? null,
        input.language !== undefined, input.language ?? null, input.timezone !== undefined, input.timezone ?? null,
        input.source ?? null, input.sourceDetail !== undefined, input.sourceDetail ?? null,
        input.campaignId !== undefined, input.campaignId ?? null, input.campaignName !== undefined, input.campaignName ?? null,
        input.adSetId !== undefined, input.adSetId ?? null, input.adSetName !== undefined, input.adSetName ?? null,
        input.adId !== undefined, input.adId ?? null, input.adName !== undefined, input.adName ?? null,
        input.landingPage !== undefined, input.landingPage ?? null, input.referrer !== undefined, input.referrer ?? null,
        input.utmSource !== undefined, input.utmSource ?? null, input.utmMedium !== undefined, input.utmMedium ?? null,
        input.utmCampaign !== undefined, input.utmCampaign ?? null, input.utmContent !== undefined, input.utmContent ?? null,
        input.utmTerm !== undefined, input.utmTerm ?? null, input.clickIdentifiers !== undefined, JSON.stringify(input.clickIdentifiers ?? {}),
        input.interestNote !== undefined, input.interestNote ?? null, input.ownerUserId !== undefined, input.ownerUserId ?? null,
        input.status ?? null, input.lostReason ?? null, input.version,
      );
      if (!rows.length) throw new ConflictException('Lead changed or is outside the active scope.');

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         SELECT tenant_id,company_id,branch_id,id,'LEAD_UPDATED',$2::text,$3::jsonb FROM crm_leads WHERE id=$1::text`,
        id, actorUserId,
        JSON.stringify({ status: input.status ?? undefined,
          acquisitionContextChanged: input.sourceDetail !== undefined || input.campaignId !== undefined ||
            input.campaignName !== undefined || input.adSetId !== undefined || input.adSetName !== undefined ||
            input.adId !== undefined || input.adName !== undefined || input.landingPage !== undefined ||
            input.referrer !== undefined || input.utmSource !== undefined || input.utmMedium !== undefined ||
            input.utmCampaign !== undefined || input.utmContent !== undefined || input.utmTerm !== undefined ||
            input.clickIdentifiers !== undefined }),
      );
      return rows[0];
    });
  }
}
