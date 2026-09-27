import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmDataScopeService } from './crm-data-scope.service';

export type CrmReportingInput = Readonly<{ from: Date; to: Date }>;

@Injectable()
export class CrmReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly dataScope: CrmDataScopeService,
  ) {}

  async performance(input: CrmReportingInput) {
    const context = this.tenantContext.getContext();
    const visibility = await this.dataScope.resolve();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      date: Date;
      leadCount: number;
      contactedCount: number;
      qualifiedCount: number;
      convertedCount: number;
      lostLeadCount: number;
      opportunityCount: number;
      openOpportunityCount: number;
      wonCount: number;
      lostOpportunityCount: number;
      pipelineValue: unknown;
      wonValue: unknown;
    }>>(
      `WITH days AS (
         SELECT generate_series(date_trunc('day',$4::timestamptz),date_trunc('day',$5::timestamptz),'1 day'::interval) AS day
       ), lead_daily AS (
         SELECT date_trunc('day',l.created_at) AS day,
                COUNT(*)::int AS "leadCount",
                COUNT(*) FILTER (WHERE l.status='CONTACTED')::int AS "contactedCount",
                COUNT(*) FILTER (WHERE l.status='QUALIFIED')::int AS "qualifiedCount",
                COUNT(*) FILTER (WHERE l.status='CONVERTED')::int AS "convertedCount",
                COUNT(*) FILTER (WHERE l.status='LOST')::int AS "lostLeadCount"
         FROM crm_leads l
         WHERE l.tenant_id=$1::text AND l.company_id=$2::text
           AND ($3::text IS NULL OR l.branch_id=$3::text)
           AND l.created_at >= $4::timestamptz AND l.created_at <= $5::timestamptz
           AND ($6::boolean=FALSE OR l.owner_user_id=ANY($7::text[]))
         GROUP BY date_trunc('day',l.created_at)
       ), opportunity_daily AS (
         SELECT date_trunc('day',o.created_at) AS day,
                COUNT(*)::int AS "opportunityCount",
                COUNT(*) FILTER (WHERE o.stage NOT IN ('WON','LOST'))::int AS "openOpportunityCount",
                COUNT(*) FILTER (WHERE o.stage='WON')::int AS "wonCount",
                COUNT(*) FILTER (WHERE o.stage='LOST')::int AS "lostOpportunityCount",
                COALESCE(SUM(CASE WHEN o.stage NOT IN ('WON','LOST') THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::numeric AS "pipelineValue",
                COALESCE(SUM(CASE WHEN o.stage='WON' THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::numeric AS "wonValue"
         FROM crm_opportunities o
         WHERE o.tenant_id=$1::text AND o.company_id=$2::text
           AND ($3::text IS NULL OR o.branch_id=$3::text)
           AND o.created_at >= $4::timestamptz AND o.created_at <= $5::timestamptz
           AND ($6::boolean=FALSE OR o.owner_user_id=ANY($7::text[]))
         GROUP BY date_trunc('day',o.created_at)
       )
       SELECT d.day AS date,
              COALESCE(l."leadCount",0)::int AS "leadCount",
              COALESCE(l."contactedCount",0)::int AS "contactedCount",
              COALESCE(l."qualifiedCount",0)::int AS "qualifiedCount",
              COALESCE(l."convertedCount",0)::int AS "convertedCount",
              COALESCE(l."lostLeadCount",0)::int AS "lostLeadCount",
              COALESCE(o."opportunityCount",0)::int AS "opportunityCount",
              COALESCE(o."openOpportunityCount",0)::int AS "openOpportunityCount",
              COALESCE(o."wonCount",0)::int AS "wonCount",
              COALESCE(o."lostOpportunityCount",0)::int AS "lostOpportunityCount",
              COALESCE(o."pipelineValue",0)::numeric AS "pipelineValue",
              COALESCE(o."wonValue",0)::numeric AS "wonValue"
       FROM days d
       LEFT JOIN lead_daily l ON l.day=d.day
       LEFT JOIN opportunity_daily o ON o.day=d.day
       ORDER BY d.day ASC`,
      context.tenantId,
      context.companyId,
      visibility.branchId,
      input.from,
      input.to,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      leadCount: Number(row.leadCount),
      contactedCount: Number(row.contactedCount),
      qualifiedCount: Number(row.qualifiedCount),
      convertedCount: Number(row.convertedCount),
      lostLeadCount: Number(row.lostLeadCount),
      opportunityCount: Number(row.opportunityCount),
      openOpportunityCount: Number(row.openOpportunityCount),
      wonCount: Number(row.wonCount),
      lostOpportunityCount: Number(row.lostOpportunityCount),
      pipelineValue: Number(row.pipelineValue ?? 0),
      wonValue: Number(row.wonValue ?? 0),
      leadConversionRate: Number(row.leadCount)
        ? Math.round((Number(row.convertedCount) / Number(row.leadCount)) * 100)
        : 0,
      winRate: Number(row.opportunityCount)
        ? Math.round((Number(row.wonCount) / Number(row.opportunityCount)) * 100)
        : 0,
    }));
  }
  async salespersonPerformance(input: CrmReportingInput) {
    const context = this.tenantContext.getContext();
    const visibility = await this.dataScope.resolve();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      userId: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      leadCount: number;
      interactionCount: number;
      opportunityCount: number;
      wonCount: number;
      lostCount: number;
      wonValue: unknown;
      actualSalesValue: unknown;
      completedFollowUpCount: number;
      overdueFollowUpCount: number;
      averageFirstResponseMinutes: unknown;
    }>>(
      `WITH lead_metrics AS (
         SELECT l.owner_user_id AS user_id,COUNT(*)::int AS lead_count
           FROM crm_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id=$3::text)
            AND l.created_at >= $4::timestamptz AND l.created_at <= $5::timestamptz
            AND l.owner_user_id IS NOT NULL
            AND ($6::boolean=FALSE OR l.owner_user_id=ANY($7::text[]))
          GROUP BY l.owner_user_id
       ), interaction_metrics AS (
         SELECT i.owner_user_id AS user_id,COUNT(*)::int AS interaction_count
           FROM crm_interactions i
          WHERE i.tenant_id=$1::text AND i.company_id=$2::text
            AND ($3::text IS NULL OR i.branch_id=$3::text)
            AND i.started_at >= $4::timestamptz AND i.started_at <= $5::timestamptz
            AND ($6::boolean=FALSE OR i.owner_user_id=ANY($7::text[]))
          GROUP BY i.owner_user_id
       ), opportunity_metrics AS (
         SELECT o.owner_user_id AS user_id,
                COUNT(*)::int AS opportunity_count,
                COUNT(*) FILTER (WHERE o.stage='WON')::int AS won_count,
                COUNT(*) FILTER (WHERE o.stage='LOST')::int AS lost_count,
                COALESCE(SUM(CASE WHEN o.stage='WON' THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::numeric AS won_value
           FROM crm_opportunities o
          WHERE o.tenant_id=$1::text AND o.company_id=$2::text
            AND ($3::text IS NULL OR o.branch_id=$3::text)
            AND o.created_at >= $4::timestamptz AND o.created_at <= $5::timestamptz
            AND o.owner_user_id IS NOT NULL
            AND ($6::boolean=FALSE OR o.owner_user_id=ANY($7::text[]))
          GROUP BY o.owner_user_id
       ), sales_metrics AS (
         SELECT o.owner_user_id AS user_id,
                COALESCE(SUM(s.total),0)::numeric AS actual_sales_value
           FROM crm_opportunities o
           JOIN sales s ON s.id=o.sale_id
             AND s."tenantId"=o.tenant_id
             AND s."branchId"=o.branch_id
          WHERE o.tenant_id=$1::text AND o.company_id=$2::text
            AND ($3::text IS NULL OR o.branch_id=$3::text)
            AND s.status='CONFIRMED'
            AND s."confirmedAt" >= $4::timestamptz AND s."confirmedAt" <= $5::timestamptz
            AND o.owner_user_id IS NOT NULL
            AND ($6::boolean=FALSE OR o.owner_user_id=ANY($7::text[]))
          GROUP BY o.owner_user_id
       ), response_metrics AS (
         SELECT l.owner_user_id AS user_id,
                AVG(EXTRACT(EPOCH FROM (l.first_response_at-l.created_at))/60.0)::numeric AS average_first_response_minutes
           FROM crm_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id=$3::text)
            AND l.created_at >= $4::timestamptz AND l.created_at <= $5::timestamptz
            AND l.first_response_at IS NOT NULL
            AND l.owner_user_id IS NOT NULL
            AND ($6::boolean=FALSE OR l.owner_user_id=ANY($7::text[]))
          GROUP BY l.owner_user_id
       ), follow_up_metrics AS (
         SELECT f.assigned_user_id AS user_id,
                COUNT(*) FILTER (WHERE f.status='COMPLETED')::int AS completed_follow_up_count,
                COUNT(*) FILTER (WHERE f.status='OPEN' AND f.due_at<NOW())::int AS overdue_follow_up_count
           FROM crm_follow_ups f
          WHERE f.tenant_id=$1::text AND f.company_id=$2::text
            AND ($3::text IS NULL OR f.branch_id=$3::text)
            AND (
              (f.status='COMPLETED' AND f.completed_at >= $4::timestamptz AND f.completed_at <= $5::timestamptz)
              OR (f.status='OPEN' AND f.due_at<NOW())
            )
            AND ($6::boolean=FALSE OR f.assigned_user_id=ANY($7::text[]))
          GROUP BY f.assigned_user_id
       ), owners AS (
         SELECT user_id FROM lead_metrics
         UNION SELECT user_id FROM interaction_metrics
         UNION SELECT user_id FROM opportunity_metrics
         UNION SELECT user_id FROM sales_metrics
         UNION SELECT user_id FROM response_metrics
         UNION SELECT user_id FROM follow_up_metrics
       )
       SELECT owners.user_id AS "userId",u."firstName",u."lastName",u.email,
              COALESCE(l.lead_count,0)::int AS "leadCount",
              COALESCE(i.interaction_count,0)::int AS "interactionCount",
              COALESCE(o.opportunity_count,0)::int AS "opportunityCount",
              COALESCE(o.won_count,0)::int AS "wonCount",
              COALESCE(o.lost_count,0)::int AS "lostCount",
              COALESCE(o.won_value,0)::numeric AS "wonValue",
              COALESCE(s.actual_sales_value,0)::numeric AS "actualSalesValue",
              COALESCE(f.completed_follow_up_count,0)::int AS "completedFollowUpCount",
              COALESCE(f.overdue_follow_up_count,0)::int AS "overdueFollowUpCount",
              COALESCE(r.average_first_response_minutes,0)::numeric AS "averageFirstResponseMinutes"
         FROM owners
         LEFT JOIN users u ON u.id=owners.user_id
         LEFT JOIN lead_metrics l ON l.user_id=owners.user_id
         LEFT JOIN interaction_metrics i ON i.user_id=owners.user_id
         LEFT JOIN opportunity_metrics o ON o.user_id=owners.user_id
         LEFT JOIN sales_metrics s ON s.user_id=owners.user_id
         LEFT JOIN response_metrics r ON r.user_id=owners.user_id
         LEFT JOIN follow_up_metrics f ON f.user_id=owners.user_id
        ORDER BY COALESCE(s.actual_sales_value,0) DESC,COALESCE(o.won_count,0) DESC,owners.user_id`,
      context.tenantId,
      context.companyId,
      visibility.branchId,
      input.from,
      input.to,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );

    return rows.map((row) => {
      const decided = Number(row.wonCount) + Number(row.lostCount);
      return {
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        leadCount: Number(row.leadCount),
        interactionCount: Number(row.interactionCount),
        opportunityCount: Number(row.opportunityCount),
        wonCount: Number(row.wonCount),
        lostCount: Number(row.lostCount),
        wonValue: Number(row.wonValue ?? 0),
        actualSalesValue: Number(row.actualSalesValue ?? 0),
        completedFollowUpCount: Number(row.completedFollowUpCount),
        overdueFollowUpCount: Number(row.overdueFollowUpCount),
        averageFirstResponseMinutes: Math.round(Number(row.averageFirstResponseMinutes ?? 0)),
        leadToOpportunityRate: Number(row.leadCount)
          ? Math.round((Number(row.opportunityCount) / Number(row.leadCount)) * 100)
          : 0,
        winRate: decided
          ? Math.round((Number(row.wonCount) / decided) * 100)
          : 0,
      };
    });
  }

  async surveyorPerformance(input: CrmReportingInput) {
    const context = this.tenantContext.getContext();
    const visibility = await this.dataScope.resolve();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      staffId: string;
      firstName: string;
      lastName: string;
      leadCount: number;
      opportunityCount: number;
      wonCount: number;
      actualSalesValue: unknown;
    }>>(
      `WITH surveyor_leads AS (
         SELECT l.id,l.surveyor_staff_id,l.owner_user_id
           FROM crm_leads l
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id=$3::text)
            AND l.source='SURVEYOR'
            AND l.surveyor_staff_id IS NOT NULL
            AND l.created_at >= $4::timestamptz AND l.created_at <= $5::timestamptz
            AND ($6::boolean=FALSE OR l.owner_user_id=ANY($7::text[]))
       ), lead_metrics AS (
         SELECT surveyor_staff_id AS staff_id,COUNT(*)::int AS lead_count
           FROM surveyor_leads
          GROUP BY surveyor_staff_id
       ), opportunity_metrics AS (
         SELECT sl.surveyor_staff_id AS staff_id,
                COUNT(o.id)::int AS opportunity_count,
                COUNT(o.id) FILTER (WHERE o.stage='WON')::int AS won_count
           FROM surveyor_leads sl
           JOIN crm_opportunities o ON o.lead_id=sl.id
          GROUP BY sl.surveyor_staff_id
       ), sales_metrics AS (
         SELECT l.surveyor_staff_id AS staff_id,
                COALESCE(SUM(s.total),0)::numeric AS actual_sales_value
           FROM crm_leads l
           JOIN crm_opportunities o ON o.lead_id=l.id
           JOIN sales s ON s.id=o.sale_id
             AND s."tenantId"=o.tenant_id
             AND s."branchId"=o.branch_id
          WHERE l.tenant_id=$1::text AND l.company_id=$2::text
            AND ($3::text IS NULL OR l.branch_id=$3::text)
            AND l.source='SURVEYOR'
            AND l.surveyor_staff_id IS NOT NULL
            AND s.status='CONFIRMED'
            AND s."confirmedAt" >= $4::timestamptz AND s."confirmedAt" <= $5::timestamptz
            AND ($6::boolean=FALSE OR l.owner_user_id=ANY($7::text[]))
          GROUP BY l.surveyor_staff_id
       ), staff_ids AS (
         SELECT staff_id FROM lead_metrics
         UNION SELECT staff_id FROM opportunity_metrics
         UNION SELECT staff_id FROM sales_metrics
       )
       SELECT ids.staff_id AS "staffId",st."firstName",st."lastName",
              COALESCE(lm.lead_count,0)::int AS "leadCount",
              COALESCE(om.opportunity_count,0)::int AS "opportunityCount",
              COALESCE(om.won_count,0)::int AS "wonCount",
              COALESCE(sm.actual_sales_value,0)::numeric AS "actualSalesValue"
         FROM staff_ids ids
         JOIN staff st ON st.id=ids.staff_id
         LEFT JOIN lead_metrics lm ON lm.staff_id=ids.staff_id
         LEFT JOIN opportunity_metrics om ON om.staff_id=ids.staff_id
         LEFT JOIN sales_metrics sm ON sm.staff_id=ids.staff_id
        ORDER BY COALESCE(sm.actual_sales_value,0) DESC,COALESCE(om.won_count,0) DESC,st."firstName",st."lastName"`,
      context.tenantId,
      context.companyId,
      visibility.branchId,
      input.from,
      input.to,
      visibility.restrictOwners,
      visibility.ownerUserIds,
    );

    return rows.map((row) => ({
      staffId: row.staffId,
      firstName: row.firstName,
      lastName: row.lastName,
      leadCount: Number(row.leadCount),
      opportunityCount: Number(row.opportunityCount),
      wonCount: Number(row.wonCount),
      actualSalesValue: Number(row.actualSalesValue ?? 0),
      leadToOpportunityRate: Number(row.leadCount)
        ? Math.round((Number(row.opportunityCount) / Number(row.leadCount)) * 100)
        : 0,
      leadToSaleRate: Number(row.leadCount)
        ? Math.round((Number(row.wonCount) / Number(row.leadCount)) * 100)
        : 0,
    }));
  }

}
