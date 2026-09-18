import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateLeadInput, UpdateLeadInput } from './crm.schemas';

export interface CrmLeadRow {
  id: string;
  [key: string]: unknown;
}

type DbClient = Prisma.TransactionClient | PrismaService;

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

  private async assertAssignableUser(userId: string, tx: DbClient = this.prisma) {
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

  private async assertCommercialScope(
    input: Pick<CreateLeadInput, 'interestedServiceIds' | 'interestedPackageIds' | 'preferredBranchId'>,
    tx: DbClient,
  ) {
    const context = this.context();

    if (input.preferredBranchId) {
      const branches = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT b.id FROM branches b
         JOIN companies c ON c.id=b."companyId"
         WHERE b.id=$1::text AND b."companyId"=$2::text AND c."tenantId"=$3::text AND b.status='ACTIVE' LIMIT 1`,
        input.preferredBranchId, context.companyId, context.tenantId,
      );
      if (!branches.length) throw new BadRequestException('Preferred branch is outside the active company.');
    }

    if (input.interestedServiceIds?.length) {
      const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM services s
         JOIN branches b ON b.id=s."branchId"
         WHERE s.id=ANY($1::text[]) AND s."tenantId"=$2::text AND b."companyId"=$3::text`,
        input.interestedServiceIds, context.tenantId, context.companyId,
      );
      if (Number(rows[0]?.count ?? 0) !== input.interestedServiceIds.length) {
        throw new BadRequestException('One or more interested services are outside the active company.');
      }
    }

    if (input.interestedPackageIds?.length) {
      const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM service_packages p
         JOIN branches b ON b.id=p."branchId"
         WHERE p.id=ANY($1::text[]) AND p."tenantId"=$2::text AND b."companyId"=$3::text`,
        input.interestedPackageIds, context.tenantId, context.companyId,
      );
      if (Number(rows[0]?.count ?? 0) !== input.interestedPackageIds.length) {
        throw new BadRequestException('One or more interested packages are outside the active company.');
      }
    }
  }

  private acquisitionSelect() {
    return `l.source,l.source_detail AS "sourceDetail",l.campaign_id AS "campaignId",l.campaign_name AS "campaignName",
            l.ad_set_id AS "adSetId",l.ad_set_name AS "adSetName",l.ad_id AS "adId",l.ad_name AS "adName",
            l.landing_page AS "landingPage",l.referrer,l.utm_source AS "utmSource",l.utm_medium AS "utmMedium",
            l.utm_campaign AS "utmCampaign",l.utm_content AS "utmContent",l.utm_term AS "utmTerm",
            l.click_identifiers AS "clickIdentifiers"`;
  }

  private commercialSelect() {
    return `l.interested_service_ids AS "interestedServiceIds",l.interested_package_ids AS "interestedPackageIds",
            l.preferred_branch_id AS "preferredBranchId",l.estimated_budget AS "estimatedBudget",
            l.budget_currency AS "budgetCurrency",l.purchase_urgency AS "purchaseUrgency",
            l.consultation_need AS "consultationNeed",l.customer_intent AS "customerIntent"`;
  }

  async list(filters: { status?: string; ownerUserId?: string; search?: string; limit?: number }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<CrmLeadRow[]>(
      `SELECT l.id,l.first_name AS "firstName",l.last_name AS "lastName",l.phone,l.alternative_phone AS "alternativePhone",l.email,
              l.preferred_contact_channel AS "preferredContactChannel",l.language,l.timezone,
              ${this.acquisitionSelect()},${this.commercialSelect()},l.status,l.interest_note AS "interestNote",l.customer_id AS "customerId",
              l.owner_user_id AS "ownerUserId",l.version,l.created_at AS "createdAt",l.updated_at AS "updatedAt",
              o.id AS "opportunityId",o.stage AS "opportunityStage",o.estimated_value AS "estimatedValue"
       FROM crm_leads l LEFT JOIN crm_opportunities o ON o.lead_id=l.id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text
         AND ($3::text IS NULL OR l.branch_id=$3::text)
         AND ($4::text IS NULL OR l.status=$4::text)
         AND ($5::text IS NULL OR l.owner_user_id=$5::text)
         AND ($6::text IS NULL OR concat_ws(' ',l.first_name,l.last_name,l.phone,l.alternative_phone,l.email,l.source,l.source_detail,l.campaign_name,l.ad_set_name,l.ad_name,l.utm_campaign,l.customer_intent) ILIKE '%' || $6 || '%')
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
              ${this.acquisitionSelect()},${this.commercialSelect()},l.status,l.interest_note AS "interestNote",l.lost_reason AS "lostReason",
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
      await this.assertCommercialScope(input, tx);
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
           interested_service_ids,interested_package_ids,preferred_branch_id,estimated_budget,budget_currency,purchase_urgency,consultation_need,customer_intent,
           interest_note,created_by_user_id
         ) VALUES(
           $1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
           $20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb,$30::text[],$31::text[],$32::text,$33,$34,$35,$36,$37,$38,$39::text
         )
         RETURNING id,first_name AS "firstName",last_name AS "lastName",phone,alternative_phone AS "alternativePhone",email,
                   preferred_contact_channel AS "preferredContactChannel",language,timezone,source,source_detail AS "sourceDetail",
                   campaign_id AS "campaignId",campaign_name AS "campaignName",ad_set_id AS "adSetId",ad_set_name AS "adSetName",
                   ad_id AS "adId",ad_name AS "adName",landing_page AS "landingPage",referrer,utm_source AS "utmSource",
                   utm_medium AS "utmMedium",utm_campaign AS "utmCampaign",utm_content AS "utmContent",utm_term AS "utmTerm",
                   click_identifiers AS "clickIdentifiers",interested_service_ids AS "interestedServiceIds",
                   interested_package_ids AS "interestedPackageIds",preferred_branch_id AS "preferredBranchId",
                   estimated_budget AS "estimatedBudget",budget_currency AS "budgetCurrency",purchase_urgency AS "purchaseUrgency",
                   consultation_need AS "consultationNeed",customer_intent AS "customerIntent",status,interest_note AS "interestNote",
                   owner_user_id AS "ownerUserId",customer_id AS "customerId",version`,
        context.tenantId, context.companyId, branchId, input.customerId ?? null, input.ownerUserId ?? actorUserId,
        input.firstName, input.lastName, input.phone ?? null, input.alternativePhone ?? null, input.email?.toLowerCase() ?? null,
        input.preferredContactChannel ?? null, input.language ?? null, input.timezone ?? null, input.source,
        input.sourceDetail ?? null, input.campaignId ?? null, input.campaignName ?? null, input.adSetId ?? null, input.adSetName ?? null,
        input.adId ?? null, input.adName ?? null, input.landingPage ?? null, input.referrer ?? null,
        input.utmSource ?? null, input.utmMedium ?? null, input.utmCampaign ?? null, input.utmContent ?? null, input.utmTerm ?? null,
        JSON.stringify(input.clickIdentifiers ?? {}), input.interestedServiceIds ?? [], input.interestedPackageIds ?? [],
        input.preferredBranchId ?? null, input.estimatedBudget ?? null, input.budgetCurrency, input.purchaseUrgency ?? null,
        input.consultationNeed ?? null, input.customerIntent ?? null, input.interestNote ?? null, actorUserId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_CREATED',$5::text,$6::jsonb)`,
        context.tenantId, context.companyId, branchId, rows[0].id, actorUserId,
        JSON.stringify({ source: input.source, sourceDetail: input.sourceDetail, campaignId: input.campaignId,
          campaignName: input.campaignName, utmSource: input.utmSource, utmCampaign: input.utmCampaign,
          commercialContextCaptured: Boolean(input.interestedServiceIds?.length || input.interestedPackageIds?.length ||
            input.preferredBranchId || input.estimatedBudget !== undefined || input.purchaseUrgency || input.consultationNeed || input.customerIntent) }),
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
      await this.assertCommercialScope(input, tx);
      const rows = await tx.$queryRawUnsafe<CrmLeadRow[]>(
        `UPDATE crm_leads SET
           first_name=COALESCE($5,first_name),last_name=COALESCE($6,last_name),
           phone=CASE WHEN $7::boolean THEN $8 ELSE phone END,alternative_phone=CASE WHEN $9::boolean THEN $10 ELSE alternative_phone END,
           email=CASE WHEN $11::boolean THEN lower($12) ELSE email END,preferred_contact_channel=CASE WHEN $13::boolean THEN $14 ELSE preferred_contact_channel END,
           language=CASE WHEN $15::boolean THEN $16 ELSE language END,timezone=CASE WHEN $17::boolean THEN $18 ELSE timezone END,
           source=COALESCE($19,source),source_detail=CASE WHEN $20::boolean THEN $21 ELSE source_detail END,
           campaign_id=CASE WHEN $22::boolean THEN $23 ELSE campaign_id END,campaign_name=CASE WHEN $24::boolean THEN $25 ELSE campaign_name END,
           ad_set_id=CASE WHEN $26::boolean THEN $27 ELSE ad_set_id END,ad_set_name=CASE WHEN $28::boolean THEN $29 ELSE ad_set_name END,
           ad_id=CASE WHEN $30::boolean THEN $31 ELSE ad_id END,ad_name=CASE WHEN $32::boolean THEN $33 ELSE ad_name END,
           landing_page=CASE WHEN $34::boolean THEN $35 ELSE landing_page END,referrer=CASE WHEN $36::boolean THEN $37 ELSE referrer END,
           utm_source=CASE WHEN $38::boolean THEN $39 ELSE utm_source END,utm_medium=CASE WHEN $40::boolean THEN $41 ELSE utm_medium END,
           utm_campaign=CASE WHEN $42::boolean THEN $43 ELSE utm_campaign END,utm_content=CASE WHEN $44::boolean THEN $45 ELSE utm_content END,
           utm_term=CASE WHEN $46::boolean THEN $47 ELSE utm_term END,click_identifiers=CASE WHEN $48::boolean THEN $49::jsonb ELSE click_identifiers END,
           interested_service_ids=CASE WHEN $50::boolean THEN $51::text[] ELSE interested_service_ids END,
           interested_package_ids=CASE WHEN $52::boolean THEN $53::text[] ELSE interested_package_ids END,
           preferred_branch_id=CASE WHEN $54::boolean THEN $55::text ELSE preferred_branch_id END,
           estimated_budget=CASE WHEN $56::boolean THEN $57 ELSE estimated_budget END,budget_currency=COALESCE($58,budget_currency),
           purchase_urgency=CASE WHEN $59::boolean THEN $60 ELSE purchase_urgency END,
           consultation_need=CASE WHEN $61::boolean THEN $62 ELSE consultation_need END,
           customer_intent=CASE WHEN $63::boolean THEN $64 ELSE customer_intent END,
           interest_note=CASE WHEN $65::boolean THEN $66 ELSE interest_note END,owner_user_id=CASE WHEN $67::boolean THEN $68::text ELSE owner_user_id END,
           status=COALESCE($69,status),lost_reason=CASE WHEN $69='LOST' THEN $70 ELSE NULL END,version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) AND version=$71
         RETURNING id,status,source,source_detail AS "sourceDetail",campaign_id AS "campaignId",campaign_name AS "campaignName",
                   utm_source AS "utmSource",utm_medium AS "utmMedium",utm_campaign AS "utmCampaign",click_identifiers AS "clickIdentifiers",
                   interested_service_ids AS "interestedServiceIds",interested_package_ids AS "interestedPackageIds",
                   preferred_branch_id AS "preferredBranchId",estimated_budget AS "estimatedBudget",budget_currency AS "budgetCurrency",
                   purchase_urgency AS "purchaseUrgency",consultation_need AS "consultationNeed",customer_intent AS "customerIntent",
                   version,updated_at AS "updatedAt"`,
        id, context.tenantId, context.companyId, branchId, input.firstName ?? null, input.lastName ?? null,
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
        input.interestedServiceIds !== undefined, input.interestedServiceIds ?? [], input.interestedPackageIds !== undefined, input.interestedPackageIds ?? [],
        input.preferredBranchId !== undefined, input.preferredBranchId ?? null, input.estimatedBudget !== undefined, input.estimatedBudget ?? null,
        input.budgetCurrency ?? null, input.purchaseUrgency !== undefined, input.purchaseUrgency ?? null,
        input.consultationNeed !== undefined, input.consultationNeed ?? null, input.customerIntent !== undefined, input.customerIntent ?? null,
        input.interestNote !== undefined, input.interestNote ?? null, input.ownerUserId !== undefined, input.ownerUserId ?? null,
        input.status ?? null, input.lostReason ?? null, input.version,
      );
      if (!rows.length) throw new ConflictException('Lead changed or is outside the active scope.');

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         SELECT tenant_id,company_id,branch_id,id,'LEAD_UPDATED',$2::text,$3::jsonb FROM crm_leads WHERE id=$1::text`,
        id, actorUserId,
        JSON.stringify({ status: input.status ?? undefined,
          acquisitionContextChanged: input.sourceDetail !== undefined || input.campaignId !== undefined || input.campaignName !== undefined ||
            input.adSetId !== undefined || input.adSetName !== undefined || input.adId !== undefined || input.adName !== undefined ||
            input.landingPage !== undefined || input.referrer !== undefined || input.utmSource !== undefined || input.utmMedium !== undefined ||
            input.utmCampaign !== undefined || input.utmContent !== undefined || input.utmTerm !== undefined || input.clickIdentifiers !== undefined,
          commercialContextChanged: input.interestedServiceIds !== undefined || input.interestedPackageIds !== undefined ||
            input.preferredBranchId !== undefined || input.estimatedBudget !== undefined || input.budgetCurrency !== undefined ||
            input.purchaseUrgency !== undefined || input.consultationNeed !== undefined || input.customerIntent !== undefined }),
      );
      return rows[0];
    });
  }
}
