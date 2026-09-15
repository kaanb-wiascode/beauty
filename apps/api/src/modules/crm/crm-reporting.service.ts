import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type CrmReportingInput = Readonly<{ from: Date; to: Date }>;

@Injectable()
export class CrmReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async performance(input: CrmReportingInput) {
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      date: Date;
      leadCount: number;
      contactedCount: number;
      qualifiedCount: number;
      convertedCount: number;
      lostLeadCount: number;
      opportunityCount: number;
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
         GROUP BY date_trunc('day',l.created_at)
       ), opportunity_daily AS (
         SELECT date_trunc('day',o.created_at) AS day,
                COUNT(*)::int AS "opportunityCount",
                COUNT(*) FILTER (WHERE o.stage='WON')::int AS "wonCount",
                COUNT(*) FILTER (WHERE o.stage='LOST')::int AS "lostOpportunityCount",
                COALESCE(SUM(CASE WHEN o.stage<>'LOST' THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::numeric AS "pipelineValue",
                COALESCE(SUM(CASE WHEN o.stage='WON' THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::numeric AS "wonValue"
         FROM crm_opportunities o
         WHERE o.tenant_id=$1::text AND o.company_id=$2::text
           AND ($3::text IS NULL OR o.branch_id=$3::text)
           AND o.created_at >= $4::timestamptz AND o.created_at <= $5::timestamptz
         GROUP BY date_trunc('day',o.created_at)
       )
       SELECT d.day AS date,
              COALESCE(l."leadCount",0)::int AS "leadCount",
              COALESCE(l."contactedCount",0)::int AS "contactedCount",
              COALESCE(l."qualifiedCount",0)::int AS "qualifiedCount",
              COALESCE(l."convertedCount",0)::int AS "convertedCount",
              COALESCE(l."lostLeadCount",0)::int AS "lostLeadCount",
              COALESCE(o."opportunityCount",0)::int AS "opportunityCount",
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
      context.branchId,
      input.from,
      input.to,
    );

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      leadCount: Number(row.leadCount),
      contactedCount: Number(row.contactedCount),
      qualifiedCount: Number(row.qualifiedCount),
      convertedCount: Number(row.convertedCount),
      lostLeadCount: Number(row.lostLeadCount),
      opportunityCount: Number(row.opportunityCount),
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
}
