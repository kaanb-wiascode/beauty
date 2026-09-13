import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type MetricsRow = {
  newLeads: number;
  openOpportunities: number;
  weightedPipeline: number;
  overdueFollowUps: number;
  todayFollowUps: number;
  wonOpportunities: number;
  lostOpportunities: number;
  closing30Days: number;
  forecast30Days: number;
  staleOpportunities: number;
};

type PipelineRow = {
  stage: string;
  count: number;
  totalValue: number;
  weightedValue: number;
};

type AgingRow = {
  age0to7: number;
  age8to14: number;
  age15to30: number;
  age31plus: number;
};

type OwnerWorkloadRow = {
  ownerUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  openOpportunityCount: number;
  weightedValue: number;
  openFollowUpCount: number;
  overdueFollowUpCount: number;
};

type ActionFollowUpRow = {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  assignedUserId: string;
  channel: string;
  dueAt: Date;
  note: string | null;
  version: number;
  subjectLabel: string;
};

type ActionOpportunityRow = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: string;
  estimatedValue: number | null;
  currency: string;
  probability: number;
  updatedAt: Date;
  subjectLabel: string;
};

@Injectable()
export class CrmOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  async listActionFollowUps(filters: {
    mode: 'OVERDUE' | 'TODAY';
    dayStart: Date;
    dayEnd: Date;
    assignedUserId?: string;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
    return this.prisma.$queryRawUnsafe<ActionFollowUpRow[]>(
      `SELECT f.id,f.lead_id AS "leadId",f.opportunity_id AS "opportunityId",
              f.assigned_user_id AS "assignedUserId",f.channel,f.due_at AS "dueAt",
              f.note,f.version,
              COALESCE(NULLIF(trim(concat_ws(' ',l.first_name,l.last_name)),''),o.title,'Müşteri İlişkileri Kaydı') AS "subjectLabel"
         FROM crm_follow_ups f
         LEFT JOIN crm_leads l
           ON l.id=f.lead_id AND l.tenant_id=f.tenant_id AND l.company_id=f.company_id AND l.branch_id=f.branch_id
         LEFT JOIN crm_opportunities o
           ON o.id=f.opportunity_id AND o.tenant_id=f.tenant_id AND o.company_id=f.company_id AND o.branch_id=f.branch_id
        WHERE f.tenant_id=$1::text AND f.company_id=$2::text
          AND ($3::text IS NULL OR f.branch_id=$3::text)
          AND f.status='OPEN'
          AND ($4::text IS NULL OR f.assigned_user_id=$4::text)
          AND (
            ($5::text='OVERDUE' AND f.due_at < NOW()) OR
            ($5::text='TODAY' AND f.due_at >= $6::timestamptz AND f.due_at < $7::timestamptz)
          )
        ORDER BY f.due_at,f.id
        LIMIT $8`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.assignedUserId ?? null,
      filters.mode,
      filters.dayStart,
      filters.dayEnd,
      limit,
    );
  }

  async listStaleOpportunities(filters: {
    ownerUserId?: string;
    staleBefore: Date;
    limit?: number;
  }) {
    const context = this.context();
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
    return this.prisma.$queryRawUnsafe<ActionOpportunityRow[]>(
      `SELECT o.id,o.lead_id AS "leadId",o.customer_id AS "customerId",o.owner_user_id AS "ownerUserId",
              o.title,o.stage,o.estimated_value AS "estimatedValue",o.currency,o.probability,
              o.updated_at AS "updatedAt",
              COALESCE(NULLIF(trim(concat_ws(' ',l.first_name,l.last_name)),''),
                       NULLIF(trim(concat_ws(' ',c."firstName",c."lastName")),''),
                       'Müşteri Bağlantısı Yok') AS "subjectLabel"
         FROM crm_opportunities o
         LEFT JOIN crm_leads l
           ON l.id=o.lead_id AND l.tenant_id=o.tenant_id AND l.company_id=o.company_id AND l.branch_id=o.branch_id
         LEFT JOIN customers c
           ON c.id=o.customer_id AND c."tenantId"=o.tenant_id AND c."branchId"=o.branch_id
        WHERE o.tenant_id=$1::text AND o.company_id=$2::text
          AND ($3::text IS NULL OR o.branch_id=$3::text)
          AND ($4::text IS NULL OR o.owner_user_id=$4::text)
          AND o.stage NOT IN ('WON','LOST')
          AND o.updated_at < $5::timestamptz
        ORDER BY o.updated_at,o.id
        LIMIT $6`,
      context.tenantId,
      context.companyId,
      context.branchId,
      filters.ownerUserId ?? null,
      filters.staleBefore,
      limit,
    );
  }

  async getSummary(dayStart: Date, dayEnd: Date) {
    const context = this.context();
    const scope = [context.tenantId, context.companyId, context.branchId] as const;

    const [metricRows, pipeline, agingRows, ownerWorkload] = await Promise.all([
      this.prisma.$queryRawUnsafe<MetricsRow[]>(
        `SELECT
           (SELECT COUNT(*)::int FROM crm_leads l
             WHERE l.tenant_id=$1::text AND l.company_id=$2::text
               AND ($3::text IS NULL OR l.branch_id=$3::text)
               AND l.status='NEW') AS "newLeads",
           (SELECT COUNT(*)::int FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text)
               AND o.stage NOT IN ('WON','LOST')) AS "openOpportunities",
           (SELECT COALESCE(SUM(COALESCE(o.estimated_value,0) * o.probability / 100.0),0)::float8
              FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text)
               AND o.stage NOT IN ('WON','LOST')) AS "weightedPipeline",
           (SELECT COUNT(*)::int FROM crm_follow_ups f
             WHERE f.tenant_id=$1::text AND f.company_id=$2::text
               AND ($3::text IS NULL OR f.branch_id=$3::text)
               AND f.status='OPEN' AND f.due_at < NOW()) AS "overdueFollowUps",
           (SELECT COUNT(*)::int FROM crm_follow_ups f
             WHERE f.tenant_id=$1::text AND f.company_id=$2::text
               AND ($3::text IS NULL OR f.branch_id=$3::text)
               AND f.status='OPEN' AND f.due_at >= $4::timestamptz AND f.due_at < $5::timestamptz) AS "todayFollowUps",
           (SELECT COUNT(*)::int FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text) AND o.stage='WON') AS "wonOpportunities",
           (SELECT COUNT(*)::int FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text) AND o.stage='LOST') AS "lostOpportunities",
           (SELECT COUNT(*)::int FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text)
               AND o.stage NOT IN ('WON','LOST')
               AND o.expected_close_date >= NOW()
               AND o.expected_close_date < NOW() + INTERVAL '30 days') AS "closing30Days",
           (SELECT COALESCE(SUM(COALESCE(o.estimated_value,0) * o.probability / 100.0),0)::float8
              FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text)
               AND o.stage NOT IN ('WON','LOST')
               AND o.expected_close_date >= NOW()
               AND o.expected_close_date < NOW() + INTERVAL '30 days') AS "forecast30Days",
           (SELECT COUNT(*)::int FROM crm_opportunities o
             WHERE o.tenant_id=$1::text AND o.company_id=$2::text
               AND ($3::text IS NULL OR o.branch_id=$3::text)
               AND o.stage NOT IN ('WON','LOST')
               AND o.updated_at < NOW() - INTERVAL '14 days') AS "staleOpportunities"`,
        ...scope,
        dayStart,
        dayEnd,
      ),
      this.prisma.$queryRawUnsafe<PipelineRow[]>(
        `SELECT o.stage,
                COUNT(*)::int AS count,
                COALESCE(SUM(COALESCE(o.estimated_value,0)),0)::float8 AS "totalValue",
                COALESCE(SUM(COALESCE(o.estimated_value,0) * o.probability / 100.0),0)::float8 AS "weightedValue"
           FROM crm_opportunities o
          WHERE o.tenant_id=$1::text AND o.company_id=$2::text
            AND ($3::text IS NULL OR o.branch_id=$3::text)
          GROUP BY o.stage
          ORDER BY o.stage`,
        ...scope,
      ),
      this.prisma.$queryRawUnsafe<AgingRow[]>(
        `SELECT
           COUNT(*) FILTER (WHERE o.created_at >= NOW() - INTERVAL '7 days')::int AS "age0to7",
           COUNT(*) FILTER (WHERE o.created_at < NOW() - INTERVAL '7 days' AND o.created_at >= NOW() - INTERVAL '14 days')::int AS "age8to14",
           COUNT(*) FILTER (WHERE o.created_at < NOW() - INTERVAL '14 days' AND o.created_at >= NOW() - INTERVAL '30 days')::int AS "age15to30",
           COUNT(*) FILTER (WHERE o.created_at < NOW() - INTERVAL '30 days')::int AS "age31plus"
           FROM crm_opportunities o
          WHERE o.tenant_id=$1::text AND o.company_id=$2::text
            AND ($3::text IS NULL OR o.branch_id=$3::text)
            AND o.stage NOT IN ('WON','LOST')`,
        ...scope,
      ),
      this.prisma.$queryRawUnsafe<OwnerWorkloadRow[]>(
        `WITH opportunity_workload AS (
           SELECT COALESCE(o.owner_user_id,'__unassigned__') AS owner_key,
                  COUNT(*)::int AS open_opportunity_count,
                  COALESCE(SUM(COALESCE(o.estimated_value,0) * o.probability / 100.0),0)::float8 AS weighted_value
             FROM crm_opportunities o
            WHERE o.tenant_id=$1::text AND o.company_id=$2::text
              AND ($3::text IS NULL OR o.branch_id=$3::text)
              AND o.stage NOT IN ('WON','LOST')
            GROUP BY COALESCE(o.owner_user_id,'__unassigned__')
         ), follow_up_workload AS (
           SELECT f.assigned_user_id AS owner_key,
                  COUNT(*)::int AS open_follow_up_count,
                  COUNT(*) FILTER (WHERE f.due_at < NOW())::int AS overdue_follow_up_count
             FROM crm_follow_ups f
            WHERE f.tenant_id=$1::text AND f.company_id=$2::text
              AND ($3::text IS NULL OR f.branch_id=$3::text)
              AND f.status='OPEN'
            GROUP BY f.assigned_user_id
         ), owners AS (
           SELECT owner_key FROM opportunity_workload
           UNION
           SELECT owner_key FROM follow_up_workload
         )
         SELECT NULLIF(owners.owner_key,'__unassigned__') AS "ownerUserId",
                u."firstName",u."lastName",u.email,
                COALESCE(ow.open_opportunity_count,0)::int AS "openOpportunityCount",
                COALESCE(ow.weighted_value,0)::float8 AS "weightedValue",
                COALESCE(fw.open_follow_up_count,0)::int AS "openFollowUpCount",
                COALESCE(fw.overdue_follow_up_count,0)::int AS "overdueFollowUpCount"
           FROM owners
           LEFT JOIN opportunity_workload ow ON ow.owner_key=owners.owner_key
           LEFT JOIN follow_up_workload fw ON fw.owner_key=owners.owner_key
           LEFT JOIN users u ON u.id=NULLIF(owners.owner_key,'__unassigned__')
          ORDER BY COALESCE(fw.overdue_follow_up_count,0) DESC,
                   COALESCE(ow.open_opportunity_count,0) DESC,
                   owners.owner_key`,
        ...scope,
      ),
    ]);

    const metrics = metricRows[0] ?? {
      newLeads: 0,
      openOpportunities: 0,
      weightedPipeline: 0,
      overdueFollowUps: 0,
      todayFollowUps: 0,
      wonOpportunities: 0,
      lostOpportunities: 0,
      closing30Days: 0,
      forecast30Days: 0,
      staleOpportunities: 0,
    };
    const decided = metrics.wonOpportunities + metrics.lostOpportunities;

    return {
      metrics: {
        ...metrics,
        conversionRate: decided
          ? Math.round((metrics.wonOpportunities / decided) * 100)
          : 0,
      },
      pipeline,
      aging: agingRows[0] ?? {
        age0to7: 0,
        age8to14: 0,
        age15to30: 0,
        age31plus: 0,
      },
      ownerWorkload,
    };
  }
}
