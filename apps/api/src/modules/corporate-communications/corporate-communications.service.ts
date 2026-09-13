import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateBrandAssetInput,
  CreateCampaignInput,
  CreateMarketingLeadInput,
  CreateProviderConnectionInput,
  CreateRoutingRuleInput,
} from './corporate-communications.schemas';

type Row = { id: string; [key: string]: unknown };

@Injectable()
export class CorporateCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async assertBranch(branchId: string) {
    const { companyId } = this.context();
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Branch is outside the active company.');
  }

  private async assertAssignableUser(userId: string, branchId?: string | null) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT u.id
       FROM users u
       JOIN memberships m ON m."userId"=u.id
       JOIN roles r ON r.id=m."roleId" AND r."tenantId"=m."tenantId"
       WHERE u.id=$1::text AND m."tenantId"=$2::text AND m."companyId"=$3::text
         AND m.status='ACTIVE'
         AND ($4::text IS NULL OR r.scope<>'BRANCH' OR EXISTS(
           SELECT 1 FROM membership_branch_access mba
           WHERE mba."membershipId"=m.id AND mba."branchId"=$4::text
         ))
       LIMIT 1`,
      userId,
      tenantId,
      companyId,
      branchId ?? null,
    );
    if (!rows.length) throw new BadRequestException('Assignee is not active in this company/branch.');
  }

  private async assertCampaign(campaignId: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM corporate_communication_campaigns
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,
      campaignId,
      tenantId,
      companyId,
    );
    if (!rows.length) throw new BadRequestException('Campaign is outside the active company.');
  }

  async dashboard() {
    const { tenantId, companyId, branchId } = this.context();
    const [row] = await this.prisma.$queryRawUnsafe<
      Array<{
        activeCampaigns: bigint;
        totalCampaigns: bigint;
        totalSpend: unknown;
        leads: bigint;
        appointments: bigint;
        wonLeads: bigint;
        revenue: unknown;
      }>
    >(
      `SELECT
         (SELECT count(*) FROM corporate_communication_campaigns c
          WHERE c.tenant_id=$1::text AND c.company_id=$2::text
            AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text)
            AND c.status='ACTIVE') AS "activeCampaigns",
         (SELECT count(*) FROM corporate_communication_campaigns c
          WHERE c.tenant_id=$1::text AND c.company_id=$2::text
            AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text)) AS "totalCampaigns",
         (SELECT COALESCE(sum(c.spent_amount),0) FROM corporate_communication_campaigns c
          WHERE c.tenant_id=$1::text AND c.company_id=$2::text
            AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text)) AS "totalSpend",
         (SELECT count(*) FROM corporate_marketing_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)) AS leads,
         (SELECT count(*) FROM corporate_marketing_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
            AND l.appointment_id IS NOT NULL) AS appointments,
         (SELECT count(*) FROM corporate_marketing_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
            AND l.status='WON') AS "wonLeads",
         (SELECT COALESCE(sum(l.revenue_amount),0) FROM corporate_marketing_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)) AS revenue`,
      tenantId,
      companyId,
      branchId,
    );

    const spend = Number(row.totalSpend ?? 0);
    const leads = Number(row.leads);
    const wonLeads = Number(row.wonLeads);
    const revenue = Number(row.revenue ?? 0);
    return {
      activeCampaigns: Number(row.activeCampaigns),
      totalCampaigns: Number(row.totalCampaigns),
      spend,
      leads,
      appointments: Number(row.appointments),
      wonLeads,
      revenue,
      cpl: leads > 0 ? spend / leads : null,
      cac: wonLeads > 0 ? spend / wonLeads : null,
      roas: spend > 0 ? revenue / spend : null,
    };
  }

  async listCampaigns(filters: { status?: string; search?: string; limit: number }) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.id,c.name,c.objective,c.status,c.channel,c.branch_id AS "branchId",
              c.service_id AS "serviceId",c.planned_budget AS "plannedBudget",
              c.spent_amount AS "spentAmount",c.currency,c.starts_at AS "startsAt",c.ends_at AS "endsAt",
              c.owner_user_id AS "ownerUserId",c.notes,c.created_at AS "createdAt",c.updated_at AS "updatedAt",
              (SELECT count(*)::int FROM corporate_marketing_leads l WHERE l.campaign_id=c.id) AS "leadCount",
              (SELECT COALESCE(sum(l.revenue_amount),0) FROM corporate_marketing_leads l WHERE l.campaign_id=c.id) AS revenue
       FROM corporate_communication_campaigns c
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text
         AND ($3::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$3::text)
         AND ($4::text IS NULL OR c.status=$4::text)
         AND ($5::text IS NULL OR c.name ILIKE '%' || $5 || '%')
       ORDER BY c.updated_at DESC,c.id
       LIMIT $6`,
      tenantId,
      companyId,
      branchId,
      filters.status ?? null,
      filters.search?.trim() || null,
      filters.limit,
    );
  }

  async createCampaign(input: CreateCampaignInput, actorUserId: string) {
    const { tenantId, companyId, branchId: activeBranchId } = this.context();
    const branchId = input.branchId === undefined ? activeBranchId : input.branchId;
    if (branchId) await this.assertBranch(branchId);
    if (input.ownerUserId) await this.assertAssignableUser(input.ownerUserId, branchId);
    if (input.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: {
          id: input.serviceId,
          tenantId,
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
      });
      if (!service) throw new BadRequestException('Service is outside the campaign scope.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO corporate_communication_campaigns(
         tenant_id,company_id,branch_id,name,objective,status,channel,service_id,
         planned_budget,spent_amount,currency,starts_at,ends_at,owner_user_id,notes,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8::text,$9,$10,$11,$12,$13,$14::text,$15,$16::text)
       RETURNING id,name,objective,status,channel,branch_id AS "branchId",service_id AS "serviceId",
                 planned_budget AS "plannedBudget",spent_amount AS "spentAmount",currency,
                 starts_at AS "startsAt",ends_at AS "endsAt",owner_user_id AS "ownerUserId",notes,
                 created_at AS "createdAt",updated_at AS "updatedAt"`,
      tenantId,
      companyId,
      branchId,
      input.name,
      input.objective,
      input.status,
      input.channel,
      input.serviceId ?? null,
      input.plannedBudget,
      input.spentAmount,
      input.currency,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.ownerUserId ?? null,
      input.notes ?? null,
      actorUserId,
    );
    return row;
  }

  async listMarketingLeads(filters: {
    provider?: string;
    status?: string;
    campaignId?: string;
    search?: string;
    limit: number;
  }) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT l.id,l.provider,l.external_lead_id AS "externalLeadId",l.campaign_id AS "campaignId",
              c.name AS "campaignName",l.branch_id AS "branchId",l.preferred_branch_id AS "preferredBranchId",
              l.assigned_user_id AS "assignedUserId",l.first_name AS "firstName",l.last_name AS "lastName",
              l.phone,l.email,l.status,l.service_interest AS "serviceInterest",l.crm_lead_id AS "crmLeadId",
              l.customer_id AS "customerId",l.appointment_id AS "appointmentId",l.sale_id AS "saleId",
              l.revenue_amount AS "revenueAmount",l.received_at AS "receivedAt",l.created_at AS "createdAt"
       FROM corporate_marketing_leads l
       LEFT JOIN corporate_communication_campaigns c ON c.id=l.campaign_id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text
         AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
         AND ($4::text IS NULL OR l.provider=$4::text)
         AND ($5::text IS NULL OR l.status=$5::text)
         AND ($6::text IS NULL OR l.campaign_id=$6::text)
         AND ($7::text IS NULL OR concat_ws(' ',l.first_name,l.last_name,l.phone,l.email) ILIKE '%' || $7 || '%')
       ORDER BY l.received_at DESC,l.id
       LIMIT $8`,
      tenantId,
      companyId,
      branchId,
      filters.provider ?? null,
      filters.status ?? null,
      filters.campaignId ?? null,
      filters.search?.trim() || null,
      filters.limit,
    );
  }

  async createMarketingLead(input: CreateMarketingLeadInput) {
    const { tenantId, companyId, branchId: activeBranchId } = this.context();
    const branchId = input.branchId ?? activeBranchId ?? null;
    if (branchId) await this.assertBranch(branchId);
    if (input.preferredBranchId) await this.assertBranch(input.preferredBranchId);
    if (input.campaignId) await this.assertCampaign(input.campaignId);
    if (input.assignedUserId) await this.assertAssignableUser(input.assignedUserId, branchId);

    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRawUnsafe<Row[]>(
        `INSERT INTO corporate_marketing_leads(
           tenant_id,company_id,branch_id,campaign_id,provider,external_lead_id,first_name,last_name,
           phone,email,service_interest,preferred_branch_id,assigned_user_id,source_payload,first_touch,last_touch
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11,$12::text,$13::text,$14::jsonb,$15::jsonb,$15::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING id,provider,external_lead_id AS "externalLeadId",campaign_id AS "campaignId",
                   branch_id AS "branchId",first_name AS "firstName",last_name AS "lastName",phone,email,status,
                   service_interest AS "serviceInterest",assigned_user_id AS "assignedUserId",received_at AS "receivedAt"`,
        tenantId,
        companyId,
        branchId,
        input.campaignId ?? null,
        input.provider,
        input.externalLeadId ?? null,
        input.firstName,
        input.lastName,
        input.phone ?? null,
        input.email ?? null,
        input.serviceInterest ?? null,
        input.preferredBranchId ?? null,
        input.assignedUserId ?? null,
        JSON.stringify(input.sourcePayload ?? {}),
        JSON.stringify(input.attribution ?? {}),
      );

      if (!inserted.length && input.externalLeadId) {
        const [existing] = await tx.$queryRawUnsafe<Row[]>(
          `SELECT id,provider,external_lead_id AS "externalLeadId",campaign_id AS "campaignId",
                  branch_id AS "branchId",first_name AS "firstName",last_name AS "lastName",phone,email,status,
                  service_interest AS "serviceInterest",assigned_user_id AS "assignedUserId",received_at AS "receivedAt"
           FROM corporate_marketing_leads
           WHERE company_id=$1::text AND provider=$2 AND external_lead_id=$3 LIMIT 1`,
          companyId,
          input.provider,
          input.externalLeadId,
        );
        if (!existing) throw new BadRequestException('Marketing lead could not be created.');
        return { ...existing, idempotent: true };
      }

      const lead = inserted[0];
      if (!lead) throw new BadRequestException('Marketing lead could not be created.');
      if (input.attribution) {
        await tx.$executeRawUnsafe(
          `INSERT INTO corporate_marketing_touchpoints(
             tenant_id,company_id,marketing_lead_id,campaign_id,provider,touch_type,
             external_campaign_id,external_ad_group_id,external_ad_id,utm_source,utm_medium,utm_campaign,utm_content,click_id,metadata
           ) VALUES($1::text,$2::text,$3::text,$4::text,$5,'LEAD_CAPTURE',$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
          tenantId,
          companyId,
          lead.id,
          input.campaignId ?? null,
          input.provider,
          input.attribution.externalCampaignId ?? null,
          input.attribution.externalAdGroupId ?? null,
          input.attribution.externalAdId ?? null,
          input.attribution.utmSource ?? null,
          input.attribution.utmMedium ?? null,
          input.attribution.utmCampaign ?? null,
          input.attribution.utmContent ?? null,
          input.attribution.clickId ?? null,
          JSON.stringify(input.attribution),
        );
      }
      return { ...lead, idempotent: false };
    });
  }

  async listBrandAssets() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id,name,asset_type AS "assetType",storage_key AS "storageKey",external_url AS "externalUrl",
              version,usage_rules AS "usageRules",active,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM corporate_brand_assets
       WHERE tenant_id=$1::text AND company_id=$2::text AND active=TRUE
       ORDER BY asset_type,name,id`,
      tenantId,
      companyId,
    );
  }

  async createBrandAsset(input: CreateBrandAssetInput, actorUserId: string) {
    const { tenantId, companyId } = this.context();
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO corporate_brand_assets(
         tenant_id,company_id,name,asset_type,storage_key,external_url,version,usage_rules,created_by_user_id
       ) VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8,$9::text)
       RETURNING id,name,asset_type AS "assetType",storage_key AS "storageKey",external_url AS "externalUrl",
                 version,usage_rules AS "usageRules",active,created_at AS "createdAt"`,
      tenantId,
      companyId,
      input.name,
      input.assetType,
      input.storageKey ?? null,
      input.externalUrl ?? null,
      input.version ?? null,
      input.usageRules ?? null,
      actorUserId,
    );
    return row;
  }

  async listProviderConnections() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id,provider,external_account_id AS "externalAccountId",display_name AS "displayName",status,
              last_sync_at AS "lastSyncAt",last_error AS "lastError",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM corporate_marketing_provider_connections
       WHERE tenant_id=$1::text AND company_id=$2::text
       ORDER BY provider,display_name,id`,
      tenantId,
      companyId,
    );
  }

  async createProviderConnection(input: CreateProviderConnectionInput, actorUserId: string) {
    const { tenantId, companyId } = this.context();
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO corporate_marketing_provider_connections(
         tenant_id,company_id,provider,external_account_id,display_name,status,created_by_user_id
       ) VALUES($1::text,$2::text,$3,$4,$5,'DISCONNECTED',$6::text)
       RETURNING id,provider,external_account_id AS "externalAccountId",display_name AS "displayName",status,created_at AS "createdAt"`,
      tenantId,
      companyId,
      input.provider,
      input.externalAccountId ?? null,
      input.displayName,
      actorUserId,
    );
    return row;
  }

  async listRoutingRules() {
    const { tenantId, companyId } = this.context();
    return this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT r.id,r.name,r.priority,r.active,r.provider,r.campaign_id AS "campaignId",
              r.target_branch_id AS "targetBranchId",b.name AS "targetBranchName",
              r.target_user_id AS "targetUserId",r.strategy,r.conditions,r.created_at AS "createdAt"
       FROM corporate_lead_routing_rules r
       LEFT JOIN branches b ON b.id=r.target_branch_id
       WHERE r.tenant_id=$1::text AND r.company_id=$2::text
       ORDER BY r.priority,r.created_at,r.id`,
      tenantId,
      companyId,
    );
  }

  async createRoutingRule(input: CreateRoutingRuleInput, actorUserId: string) {
    const { tenantId, companyId } = this.context();
    if (input.campaignId) await this.assertCampaign(input.campaignId);
    if (input.targetBranchId) await this.assertBranch(input.targetBranchId);
    if (input.targetUserId) await this.assertAssignableUser(input.targetUserId, input.targetBranchId);
    if (input.strategy === 'FIXED' && !input.targetBranchId && !input.targetUserId) {
      throw new BadRequestException('Fixed routing requires a target branch or user.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,provider,campaign_id,target_branch_id,target_user_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,$3,$4,$5,$6::text,$7::text,$8::text,$9,$10::jsonb,$11::text)
       RETURNING id,name,priority,active,provider,campaign_id AS "campaignId",target_branch_id AS "targetBranchId",
                 target_user_id AS "targetUserId",strategy,conditions,created_at AS "createdAt"`,
      tenantId,
      companyId,
      input.name,
      input.priority,
      input.provider ?? null,
      input.campaignId ?? null,
      input.targetBranchId ?? null,
      input.targetUserId ?? null,
      input.strategy,
      JSON.stringify(input.conditions),
      actorUserId,
    );
    return row;
  }

  async getCampaign(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.id,c.name,c.objective,c.status,c.channel,c.branch_id AS "branchId",c.service_id AS "serviceId",
              c.planned_budget AS "plannedBudget",c.spent_amount AS "spentAmount",c.currency,
              c.starts_at AS "startsAt",c.ends_at AS "endsAt",c.owner_user_id AS "ownerUserId",c.notes,
              c.created_at AS "createdAt",c.updated_at AS "updatedAt"
       FROM corporate_communication_campaigns c
       WHERE c.id=$1::text AND c.tenant_id=$2::text AND c.company_id=$3::text
         AND ($4::text IS NULL OR c.branch_id IS NULL OR c.branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Campaign not found.');
    return rows[0];
  }
}
