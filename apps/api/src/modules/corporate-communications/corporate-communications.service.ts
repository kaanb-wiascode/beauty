import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateBrandAssetInput,
  CreateCampaignInput,
  CreateMarketingLeadInput,
  CreateProviderConnectionInput,
  CreateRoutingRuleInput,
  UpdateCampaignInput,
  UpdateRoutingRuleInput,
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
    if (!branch) throw new BadRequestException('Seçilen şube aktif şirket kapsamında değil.');
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
    if (!rows.length) throw new BadRequestException('Seçilen sorumlu bu şirket veya şubede aktif değil.');
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
    if (!rows.length) throw new BadRequestException('Seçilen kampanya aktif şirket kapsamında değil.');
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

    const [funnelRow] = await this.prisma.$queryRawUnsafe<Array<{
      totalLeads: bigint;
      crmLeads: bigint;
      customers: bigint;
      appointments: bigint;
      sales: bigint;
      revenue: unknown;
    }>>(
      `SELECT
         count(*) AS "totalLeads",
         count(*) FILTER (WHERE crm_lead_id IS NOT NULL) AS "crmLeads",
         count(*) FILTER (WHERE customer_id IS NOT NULL) AS customers,
         count(*) FILTER (WHERE appointment_id IS NOT NULL) AS appointments,
         count(*) FILTER (WHERE sale_id IS NOT NULL) AS sales,
         COALESCE(sum(revenue_amount),0) AS revenue
       FROM corporate_marketing_leads
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id IS NULL OR branch_id=$3::text)`,
      tenantId,
      companyId,
      branchId,
    );

    const channels = await this.prisma.$queryRawUnsafe<Array<{
      provider: string;
      leads: bigint;
      appointments: bigint;
      sales: bigint;
      revenue: unknown;
    }>>(
      `SELECT provider,
              count(*) AS leads,
              count(*) FILTER (WHERE appointment_id IS NOT NULL) AS appointments,
              count(*) FILTER (WHERE sale_id IS NOT NULL) AS sales,
              COALESCE(sum(revenue_amount),0) AS revenue
         FROM corporate_marketing_leads
        WHERE tenant_id=$1::text AND company_id=$2::text
          AND ($3::text IS NULL OR branch_id IS NULL OR branch_id=$3::text)
        GROUP BY provider
        ORDER BY COALESCE(sum(revenue_amount),0) DESC,count(*) DESC,provider`,
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
      funnel: {
        leads: Number(funnelRow?.totalLeads ?? 0),
        crmLeads: Number(funnelRow?.crmLeads ?? 0),
        customers: Number(funnelRow?.customers ?? 0),
        appointments: Number(funnelRow?.appointments ?? 0),
        sales: Number(funnelRow?.sales ?? 0),
        revenue: Number(funnelRow?.revenue ?? 0),
      },
      channels: channels.map((item) => ({
        provider: item.provider,
        leads: Number(item.leads),
        appointments: Number(item.appointments),
        sales: Number(item.sales),
        revenue: Number(item.revenue ?? 0),
        appointmentRate: Number(item.leads) > 0 ? Number(item.appointments) / Number(item.leads) : 0,
        saleRate: Number(item.leads) > 0 ? Number(item.sales) / Number(item.leads) : 0,
      })),
    };
  }

  async reportSummary(input: { from: string; to: string }) {
    const { tenantId, companyId, branchId } = this.context();
    const fromDate = new Date(input.from + 'T00:00:00Z');
    const toDate = new Date(input.to + 'T00:00:00Z');
    const dayCount =
      Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

    const previousToDate = new Date(fromDate);
    previousToDate.setUTCDate(previousToDate.getUTCDate() - 1);
    const previousFromDate = new Date(previousToDate);
    previousFromDate.setUTCDate(previousFromDate.getUTCDate() - dayCount + 1);

    const previousFrom = previousFromDate.toISOString().slice(0, 10);
    const previousTo = previousToDate.toISOString().slice(0, 10);

    const loadPeriod = async (from: string, to: string) => {
      const [row] = await this.prisma.$queryRawUnsafe<
        Array<{
          leads: bigint;
          crmLeads: bigint;
          customers: bigint;
          appointments: bigint;
          sales: bigint;
          revenue: unknown;
          spend: unknown;
          postedSpend: unknown;
          financePending: bigint;
          contentPublished: bigint;
          prActivities: bigint;
          prReach: unknown;
          prMediaValue: unknown;
          creatorCollaborations: bigint;
        }>
      >(
        `SELECT
           (SELECT count(*) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date) AS leads,
           (SELECT count(*) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date
               AND l.crm_lead_id IS NOT NULL) AS "crmLeads",
           (SELECT count(*) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date
               AND l.customer_id IS NOT NULL) AS customers,
           (SELECT count(*) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date
               AND l.appointment_id IS NOT NULL) AS appointments,
           (SELECT count(*) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date
               AND l.sale_id IS NOT NULL) AS sales,
           (SELECT COALESCE(sum(l.revenue_amount),0) FROM corporate_marketing_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
               AND l.received_at::date BETWEEN $4::date AND $5::date) AS revenue,
           (SELECT COALESCE(sum(e.amount),0) FROM corporate_marketing_expenses e
             WHERE e.tenant_id=$1::text AND e.company_id=$2::text
               AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
               AND e.incurred_on BETWEEN $4::date AND $5::date
               AND e.status<>'CANCELLED') AS spend,
           (SELECT COALESCE(sum(e.amount),0) FROM corporate_marketing_expenses e
             WHERE e.tenant_id=$1::text AND e.company_id=$2::text
               AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
               AND e.incurred_on BETWEEN $4::date AND $5::date
               AND e.status='POSTED') AS "postedSpend",
           (SELECT count(*) FROM corporate_marketing_expenses e
             WHERE e.tenant_id=$1::text AND e.company_id=$2::text
               AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
               AND e.incurred_on BETWEEN $4::date AND $5::date
               AND e.status IN ('PENDING_FINANCE','APPROVED')) AS "financePending",
           (SELECT count(*) FROM corporate_content_items ci
             WHERE ci.tenant_id=$1::text AND ci.company_id=$2::text
               AND ($3::text IS NULL OR ci.branch_id IS NULL OR ci.branch_id=$3::text)
               AND ci.published_at::date BETWEEN $4::date AND $5::date) AS "contentPublished",
           (SELECT count(*) FROM corporate_pr_activities p
             WHERE p.tenant_id=$1::text AND p.company_id=$2::text
               AND ($3::text IS NULL OR p.branch_id IS NULL OR p.branch_id=$3::text)
               AND COALESCE(p.starts_at,p.created_at)::date BETWEEN $4::date AND $5::date
               AND p.status<>'CANCELLED') AS "prActivities",
           (SELECT COALESCE(sum(CASE WHEN p.actual_reach>0 THEN p.actual_reach ELSE p.estimated_reach END),0)
              FROM corporate_pr_activities p
             WHERE p.tenant_id=$1::text AND p.company_id=$2::text
               AND ($3::text IS NULL OR p.branch_id IS NULL OR p.branch_id=$3::text)
               AND COALESCE(p.starts_at,p.created_at)::date BETWEEN $4::date AND $5::date
               AND p.status<>'CANCELLED') AS "prReach",
           (SELECT COALESCE(sum(p.estimated_media_value),0)
              FROM corporate_pr_activities p
             WHERE p.tenant_id=$1::text AND p.company_id=$2::text
               AND ($3::text IS NULL OR p.branch_id IS NULL OR p.branch_id=$3::text)
               AND COALESCE(p.starts_at,p.created_at)::date BETWEEN $4::date AND $5::date
               AND p.status<>'CANCELLED') AS "prMediaValue",
           (SELECT count(*) FROM corporate_creator_collaborations cc
             WHERE cc.tenant_id=$1::text AND cc.company_id=$2::text
               AND ($3::text IS NULL OR cc.branch_id IS NULL OR cc.branch_id=$3::text)
               AND COALESCE(cc.starts_at,cc.created_at)::date BETWEEN $4::date AND $5::date
               AND cc.status<>'CANCELLED') AS "creatorCollaborations"`,
        tenantId,
        companyId,
        branchId,
        from,
        to,
      );

      const leads = Number(row?.leads ?? 0);
      const appointments = Number(row?.appointments ?? 0);
      const sales = Number(row?.sales ?? 0);
      const spend = Number(row?.spend ?? 0);
      const revenue = Number(row?.revenue ?? 0);

      return {
        leads,
        crmLeads: Number(row?.crmLeads ?? 0),
        customers: Number(row?.customers ?? 0),
        appointments,
        sales,
        revenue,
        spend,
        postedSpend: Number(row?.postedSpend ?? 0),
        financePending: Number(row?.financePending ?? 0),
        contentPublished: Number(row?.contentPublished ?? 0),
        prActivities: Number(row?.prActivities ?? 0),
        prReach: Number(row?.prReach ?? 0),
        prMediaValue: Number(row?.prMediaValue ?? 0),
        creatorCollaborations: Number(row?.creatorCollaborations ?? 0),
        appointmentRate: leads > 0 ? appointments / leads : 0,
        saleRate: leads > 0 ? sales / leads : 0,
        roas: spend > 0 ? revenue / spend : null,
        costPerLead: leads > 0 ? spend / leads : null,
      };
    };

    const [current, previous, channels, expenseCategories, daily] =
      await Promise.all([
        loadPeriod(input.from, input.to),
        loadPeriod(previousFrom, previousTo),
        this.prisma.$queryRawUnsafe<
          Array<{
            provider: string;
            leads: bigint;
            appointments: bigint;
            sales: bigint;
            revenue: unknown;
          }>
        >(
          `SELECT l.provider,
                  count(*) AS leads,
                  count(*) FILTER (WHERE l.appointment_id IS NOT NULL) AS appointments,
                  count(*) FILTER (WHERE l.sale_id IS NOT NULL) AS sales,
                  COALESCE(sum(l.revenue_amount),0) AS revenue
             FROM corporate_marketing_leads l
            WHERE l.tenant_id=$1::text AND l.company_id=$2::text
              AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
              AND l.received_at::date BETWEEN $4::date AND $5::date
            GROUP BY l.provider
            ORDER BY COALESCE(sum(l.revenue_amount),0) DESC,count(*) DESC,l.provider`,
          tenantId,
          companyId,
          branchId,
          input.from,
          input.to,
        ),
        this.prisma.$queryRawUnsafe<
          Array<{
            category: string;
            sourceType: string;
            amount: unknown;
            count: bigint;
            pendingCount: bigint;
          }>
        >(
          `SELECT e.category,e.source_type AS "sourceType",
                  COALESCE(sum(e.amount),0) AS amount,
                  count(*) AS count,
                  count(*) FILTER (
                    WHERE e.status IN ('PENDING_FINANCE','APPROVED')
                  ) AS "pendingCount"
             FROM corporate_marketing_expenses e
            WHERE e.tenant_id=$1::text AND e.company_id=$2::text
              AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
              AND e.incurred_on BETWEEN $4::date AND $5::date
              AND e.status<>'CANCELLED'
            GROUP BY e.category,e.source_type
            ORDER BY COALESCE(sum(e.amount),0) DESC,e.category,e.source_type`,
          tenantId,
          companyId,
          branchId,
          input.from,
          input.to,
        ),
        this.prisma.$queryRawUnsafe<
          Array<{
            day: Date | string;
            leads: bigint;
            appointments: bigint;
            sales: bigint;
            revenue: unknown;
            spend: unknown;
            contentPublished: bigint;
          }>
        >(
          `SELECT d.day,
                  (SELECT count(*) FROM corporate_marketing_leads l
                    WHERE l.tenant_id=$1::text AND l.company_id=$2::text
                      AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
                      AND l.received_at::date=d.day) AS leads,
                  (SELECT count(*) FROM corporate_marketing_leads l
                    WHERE l.tenant_id=$1::text AND l.company_id=$2::text
                      AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
                      AND l.received_at::date=d.day AND l.appointment_id IS NOT NULL) AS appointments,
                  (SELECT count(*) FROM corporate_marketing_leads l
                    WHERE l.tenant_id=$1::text AND l.company_id=$2::text
                      AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
                      AND l.received_at::date=d.day AND l.sale_id IS NOT NULL) AS sales,
                  (SELECT COALESCE(sum(l.revenue_amount),0) FROM corporate_marketing_leads l
                    WHERE l.tenant_id=$1::text AND l.company_id=$2::text
                      AND ($3::text IS NULL OR l.branch_id IS NULL OR l.branch_id=$3::text)
                      AND l.received_at::date=d.day) AS revenue,
                  (SELECT COALESCE(sum(e.amount),0) FROM corporate_marketing_expenses e
                    WHERE e.tenant_id=$1::text AND e.company_id=$2::text
                      AND ($3::text IS NULL OR e.branch_id IS NULL OR e.branch_id=$3::text)
                      AND e.incurred_on=d.day AND e.status<>'CANCELLED') AS spend,
                  (SELECT count(*) FROM corporate_content_items ci
                    WHERE ci.tenant_id=$1::text AND ci.company_id=$2::text
                      AND ($3::text IS NULL OR ci.branch_id IS NULL OR ci.branch_id=$3::text)
                      AND ci.published_at::date=d.day) AS "contentPublished"
             FROM generate_series($4::date,$5::date,'1 day'::interval) AS d(day)
            ORDER BY d.day`,
          tenantId,
          companyId,
          branchId,
          input.from,
          input.to,
        ),
      ]);

    return {
      range: {
        from: input.from,
        to: input.to,
        previousFrom,
        previousTo,
        days: dayCount,
      },
      current,
      previous,
      channels: channels.map((row) => {
        const leads = Number(row.leads);
        return {
          provider: row.provider,
          leads,
          appointments: Number(row.appointments),
          sales: Number(row.sales),
          revenue: Number(row.revenue ?? 0),
          appointmentRate:
            leads > 0 ? Number(row.appointments) / leads : 0,
          saleRate: leads > 0 ? Number(row.sales) / leads : 0,
        };
      }),
      expenseCategories: expenseCategories.map((row) => ({
        category: row.category,
        sourceType: row.sourceType,
        amount: Number(row.amount ?? 0),
        count: Number(row.count),
        pendingCount: Number(row.pendingCount),
      })),
      daily: daily.map((row) => ({
        date:
          row.day instanceof Date
            ? row.day.toISOString().slice(0, 10)
            : String(row.day).slice(0, 10),
        leads: Number(row.leads),
        appointments: Number(row.appointments),
        sales: Number(row.sales),
        revenue: Number(row.revenue ?? 0),
        spend: Number(row.spend ?? 0),
        contentPublished: Number(row.contentPublished),
      })),
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
              (SELECT COALESCE(sum(l.revenue_amount),0) FROM corporate_marketing_leads l WHERE l.campaign_id=c.id) AS revenue,
              (SELECT e.id FROM corporate_marketing_expenses e
                WHERE e.campaign_id=c.id AND e.source_type='CAMPAIGN'
                ORDER BY e.created_at DESC LIMIT 1) AS "marketingExpenseId",
              (SELECT e.status FROM corporate_marketing_expenses e
                WHERE e.campaign_id=c.id AND e.source_type='CAMPAIGN'
                ORDER BY e.created_at DESC LIMIT 1) AS "marketingFinanceStatus",
              (SELECT e.supplier_bill_id FROM corporate_marketing_expenses e
                WHERE e.campaign_id=c.id AND e.source_type='CAMPAIGN'
                ORDER BY e.created_at DESC LIMIT 1) AS "supplierBillId"
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
      if (!service) throw new BadRequestException('Seçilen hizmet kampanya kapsamında değil.');
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

  async updateCampaign(id: string, input: UpdateCampaignInput) {
    const current = await this.getCampaign(id);
    const { tenantId, companyId, branchId: activeBranchId } = this.context();

    const branchId =
      input.branchId === undefined ? (current.branchId as string | null) : input.branchId;
    const serviceId =
      input.serviceId === undefined ? (current.serviceId as string | null) : input.serviceId;
    const ownerUserId =
      input.ownerUserId === undefined ? (current.ownerUserId as string | null) : input.ownerUserId;
    const startsAt =
      input.startsAt === undefined ? (current.startsAt as Date | string | null) : input.startsAt;
    const endsAt =
      input.endsAt === undefined ? (current.endsAt as Date | string | null) : input.endsAt;

    const spentAmountChanged =
      input.spentAmount !== undefined &&
      Number(input.spentAmount) !== Number(current.spentAmount ?? 0);
    const currencyChanged =
      input.currency !== undefined &&
      input.currency !== String(current.currency ?? "TRY");

    if (spentAmountChanged || currencyChanged) {
      const [financeRecord] = await this.prisma.$queryRawUnsafe<
        Array<{ status: string }>
      >(
        `SELECT status
         FROM corporate_marketing_expenses
         WHERE tenant_id=$1::text
           AND company_id=$2::text
           AND campaign_id=$3::text
           AND source_type='CAMPAIGN'
         ORDER BY created_at DESC
         LIMIT 1`,
        tenantId,
        companyId,
        id,
      );

      if (financeRecord?.status === 'POSTED') {
        throw new BadRequestException(
          'Finansa aktarılmış kampanya harcaması doğrudan değiştirilemez. Önce finans kaydında düzeltme veya ters kayıt işlemi yapılmalıdır.',
        );
      }
    }

    if (branchId) await this.assertBranch(branchId);
    if (ownerUserId) await this.assertAssignableUser(ownerUserId, branchId);

    if (serviceId) {
      const service = await this.prisma.service.findFirst({
        where: {
          id: serviceId,
          tenantId,
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true },
      });
      if (!service) {
        throw new BadRequestException('Seçilen hizmet kampanya kapsamında değil.');
      }
    }

    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      throw new BadRequestException(
        'Kampanya bitiş tarihi başlangıç tarihinden sonra olmalıdır.',
      );
    }

    const [updated] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE corporate_communication_campaigns
          SET name=$2,
              objective=$3,
              channel=$4,
              branch_id=$5::text,
              service_id=$6::text,
              planned_budget=$7,
              spent_amount=$8,
              currency=$9,
              starts_at=$10,
              ends_at=$11,
              owner_user_id=$12::text,
              notes=$13,
              updated_at=NOW()
        WHERE id=$1::text
          AND tenant_id=$14::text
          AND company_id=$15::text
          AND ($16::text IS NULL OR branch_id IS NULL OR branch_id=$16::text)
        RETURNING id,name,objective,status,channel,branch_id AS "branchId",
                  service_id AS "serviceId",planned_budget AS "plannedBudget",
                  spent_amount AS "spentAmount",currency,starts_at AS "startsAt",
                  ends_at AS "endsAt",owner_user_id AS "ownerUserId",notes,
                  created_at AS "createdAt",updated_at AS "updatedAt"`,
      id,
      input.name ?? current.name,
      input.objective ?? current.objective,
      input.channel ?? current.channel,
      branchId,
      serviceId,
      input.plannedBudget ?? current.plannedBudget,
      input.spentAmount ?? current.spentAmount,
      input.currency ?? current.currency,
      startsAt,
      endsAt,
      ownerUserId,
      input.notes === undefined ? current.notes : input.notes,
      tenantId,
      companyId,
      activeBranchId,
    );

    if (!updated) throw new NotFoundException('Kampanya bulunamadı.');
    return updated;
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
        if (!existing) throw new BadRequestException('Potansiyel müşteri kaydı oluşturulamadı.');
        return { ...existing, idempotent: true };
      }

      const lead = inserted[0];
      if (!lead) throw new BadRequestException('Potansiyel müşteri kaydı oluşturulamadı.');
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

  async providerConnectionHealth() {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      provider: string;
      status: string;
      credentialReference: string | null;
      credentialsConfigured: boolean;
      lastSyncAt: Date | null;
      lastError: string | null;
    }>>(
      `SELECT c.id,c.provider,c.status,c.credential_reference AS "credentialReference",
              EXISTS(
                SELECT 1 FROM corporate_marketing_provider_secrets s
                WHERE s.connection_id=c.id
                  AND s.tenant_id=c.tenant_id
                  AND s.company_id=c.company_id
              ) AS "credentialsConfigured",
              c.last_sync_at AS "lastSyncAt",c.last_error AS "lastError"
         FROM corporate_marketing_provider_connections c
        WHERE c.tenant_id=$1::text AND c.company_id=$2::text
        ORDER BY c.provider,c.id`,
      tenantId,
      companyId,
    );

    const connections = rows.map((row) => {
      const credentialsConfigured = row.credentialsConfigured && Boolean(row.credentialReference);
      const health =
        row.lastError
          ? 'ATTENTION'
          : row.status === 'CONNECTED' && credentialsConfigured
            ? 'HEALTHY'
            : row.status === 'AUTHORIZED' && credentialsConfigured
              ? 'VERIFY_REQUIRED'
              : row.status === 'CONNECTED'
                ? 'AUTH_REQUIRED'
                : 'DISCONNECTED';
      return {
        ...row,
        credentialsConfigured,
        health,
      };
    });

    return {
      total: connections.length,
      connected: connections.filter((item) => item.health === 'HEALTHY').length,
      attention: connections.filter((item) => item.health === 'ATTENTION').length,
      verificationRequired: connections.filter((item) => item.health === 'VERIFY_REQUIRED').length,
      authorizationRequired: connections.filter((item) => item.health === 'AUTH_REQUIRED').length,
      disconnected: connections.filter((item) => item.health === 'DISCONNECTED').length,
      lastSyncAt: connections
        .map((item) => item.lastSyncAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      connections,
    };
  }

  async ensureAutomaticProviderConnection(
    provider: 'META' | 'GOOGLE_ADS' | 'TIKTOK',
    actorUserId: string,
  ) {
    const { tenantId, companyId } = this.context();
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id
         FROM corporate_marketing_provider_connections
        WHERE tenant_id=$1::text
          AND company_id=$2::text
          AND provider=$3
        ORDER BY
          CASE WHEN status IN ('CONNECTED','AUTHORIZED') THEN 0 ELSE 1 END,
          updated_at DESC,
          created_at DESC
        LIMIT 1`,
      tenantId,
      companyId,
      provider,
    );
    if (existing[0]?.id) {
      return existing[0];
    }

    const displayName =
      provider === 'META'
        ? 'Meta Ads'
        : provider === 'GOOGLE_ADS'
          ? 'Google Ads'
          : 'TikTok Ads';

    const [created] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO corporate_marketing_provider_connections(
         tenant_id,company_id,provider,external_account_id,display_name,status,created_by_user_id
       ) VALUES($1::text,$2::text,$3,NULL,$4,'DISCONNECTED',$5::text)
       RETURNING id`,
      tenantId,
      companyId,
      provider,
      displayName,
      actorUserId,
    );
    if (!created?.id) {
      throw new BadRequestException('Platform bağlantısı başlatılamadı.');
    }
    return created;
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

  async disconnectProviderConnection(id: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM corporate_marketing_provider_connections
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        LIMIT 1`,
      id,
      tenantId,
      companyId,
    );
    if (!rows[0]) throw new NotFoundException('Entegrasyon bağlantısı bulunamadı.');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DELETE FROM corporate_marketing_provider_secrets
          WHERE connection_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        id,
        tenantId,
        companyId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET credential_reference=NULL,status='DISCONNECTED',last_sync_at=NULL,last_error=NULL,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        id,
        tenantId,
        companyId,
      );
    });

    return { id, status: 'DISCONNECTED' };
  }

  async routingOptions() {
    const { tenantId, companyId, branchId } = this.context();
    const [branches, users] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          ...(branchId ? { id: branchId } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.$queryRawUnsafe<Array<{ id: string; firstName: string; lastName: string; email: string }>>(
        `SELECT DISTINCT u.id,u."firstName",u."lastName",u.email
         FROM users u
         JOIN memberships m ON m."userId"=u.id
         WHERE m."tenantId"=$1::text AND m."companyId"=$2::text
           AND m.status='ACTIVE'
         ORDER BY u."firstName",u."lastName",u.email
         LIMIT 500`,
        tenantId,
        companyId,
      ),
    ]);
    return { branches, users };
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
      throw new BadRequestException('Sabit yönlendirme için hedef şube veya sorumlu seçilmelidir.');
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

  async updateRoutingRuleStatus(id: string, active: boolean) {
    const { tenantId, companyId } = this.context();
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE corporate_lead_routing_rules
          SET active=$4,updated_at=NOW()
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        RETURNING id,name,priority,active,provider,campaign_id AS "campaignId",
                  target_branch_id AS "targetBranchId",target_user_id AS "targetUserId",
                  strategy,conditions,created_at AS "createdAt",updated_at AS "updatedAt"`,
      id,
      tenantId,
      companyId,
      active,
    );
    if (!row) throw new NotFoundException('Talep dağıtım kuralı bulunamadı.');
    return row;
  }

  async updateRoutingRule(id: string, input: UpdateRoutingRuleInput) {
    const { tenantId, companyId } = this.context();

    if (input.campaignId) await this.assertCampaign(input.campaignId);
    if (input.targetBranchId) await this.assertBranch(input.targetBranchId);
    if (input.targetUserId) {
      await this.assertAssignableUser(input.targetUserId, input.targetBranchId);
    }
    if (input.strategy === 'FIXED' && !input.targetBranchId && !input.targetUserId) {
      throw new BadRequestException(
        'Sabit yönlendirme için hedef şube veya sorumlu seçilmelidir.',
      );
    }

    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE corporate_lead_routing_rules
          SET name=$4,
              priority=$5,
              provider=$6,
              campaign_id=$7::text,
              target_branch_id=$8::text,
              target_user_id=$9::text,
              strategy=$10,
              conditions=$11::jsonb,
              updated_at=NOW()
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        RETURNING id,name,priority,active,provider,campaign_id AS "campaignId",
                  target_branch_id AS "targetBranchId",target_user_id AS "targetUserId",
                  strategy,conditions,created_at AS "createdAt",updated_at AS "updatedAt"`,
      id,
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
    );

    if (!row) throw new NotFoundException('Talep dağıtım kuralı bulunamadı.');
    return row;
  }

  async deleteRoutingRule(id: string) {
    const { tenantId, companyId } = this.context();
    const existing = await this.prisma.$queryRawUnsafe<Array<{ active: boolean }>>(
      `SELECT active FROM corporate_lead_routing_rules
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       LIMIT 1`,
      id,
      tenantId,
      companyId,
    );
    if (!existing.length) {
      throw new NotFoundException('Talep dağıtım kuralı bulunamadı.');
    }
    if (existing[0].active) {
      throw new BadRequestException(
        'Aktif dağıtım kuralı silinemez. Önce kuralı pasifleştirin.',
      );
    }

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM corporate_lead_routing_rules
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      id,
      tenantId,
      companyId,
    );
    return { id, deleted: true };
  }

  async updateCampaignStatus(
    id: string,
    status: 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED',
  ) {
    const current = await this.getCampaign(id);
    const currentStatus = String(current.status);

    if (currentStatus === status) return current;

    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ['PLANNED', 'ACTIVE', 'CANCELLED'],
      PLANNED: ['DRAFT', 'ACTIVE', 'CANCELLED'],
      ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
      PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    if (!(allowedTransitions[currentStatus] ?? []).includes(status)) {
      throw new BadRequestException(
        'Bu kampanya durumu için seçilen geçişe izin verilmiyor.',
      );
    }

    const { tenantId, companyId, branchId } = this.context();
    const [updated] = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE corporate_communication_campaigns
          SET status=$2,
              starts_at=CASE WHEN $2='ACTIVE' AND starts_at IS NULL THEN NOW() ELSE starts_at END,
              ends_at=CASE WHEN $2='COMPLETED' AND ends_at IS NULL THEN NOW() ELSE ends_at END,
              updated_at=NOW()
        WHERE id=$1::text
          AND tenant_id=$3::text
          AND company_id=$4::text
          AND ($5::text IS NULL OR branch_id IS NULL OR branch_id=$5::text)
        RETURNING id,name,objective,status,channel,branch_id AS "branchId",
                  service_id AS "serviceId",planned_budget AS "plannedBudget",
                  spent_amount AS "spentAmount",currency,starts_at AS "startsAt",
                  ends_at AS "endsAt",owner_user_id AS "ownerUserId",notes,
                  created_at AS "createdAt",updated_at AS "updatedAt"`,
      id,
      status,
      tenantId,
      companyId,
      branchId,
    );

    if (!updated) throw new NotFoundException('Kampanya bulunamadı.');
    return updated;
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
    if (!rows.length) throw new NotFoundException('Kampanya bulunamadı.');
    return rows[0];
  }
}
