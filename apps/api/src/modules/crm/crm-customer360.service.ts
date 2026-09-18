import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type SummaryRow = {
  opportunityCount: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  totalPipeline: number;
  weightedPipeline: number;
  openFollowUpCount: number;
  overdueFollowUpCount: number;
  lastCrmActivityAt: Date | null;
};

type OpportunityRow = {
  id: string;
  title: string;
  stage: string;
  estimatedValue: number | null;
  currency: string;
  probability: number;
  expectedCloseDate: Date | null;
  updatedAt: Date;
};

type FollowUpRow = {
  id: string;
  opportunityId: string | null;
  assignedUserId: string;
  channel: string;
  status: string;
  dueAt: Date;
  note: string | null;
  version: number;
};

type EventRow = {
  id: string;
  opportunityId: string | null;
  eventType: string;
  createdAt: Date;
};

@Injectable()
export class CrmCustomer360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async getSummary(customerId: string) {
    const context = this.tenantContext.getContext();
    const scope = [context.tenantId, context.companyId, context.branchId] as const;

    const customer = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM customers
       WHERE id=$1::text AND "tenantId"=$2::text
         AND ($3::text IS NULL OR "branchId"=$3::text)
       LIMIT 1`,
      customerId,
      context.tenantId,
      context.branchId,
    );
    if (!customer.length) throw new NotFoundException('Customer not found.');

    const [summaryRows, opportunities, followUps, events] = await Promise.all([
      this.prisma.$queryRawUnsafe<SummaryRow[]>(
        `SELECT
           COUNT(o.id)::int AS "opportunityCount",
           COUNT(o.id) FILTER (WHERE o.stage NOT IN ('WON','LOST'))::int AS "openOpportunityCount",
           COUNT(o.id) FILTER (WHERE o.stage='WON')::int AS "wonOpportunityCount",
           COALESCE(SUM(CASE WHEN o.stage NOT IN ('WON','LOST') THEN COALESCE(o.estimated_value,0) ELSE 0 END),0)::float8 AS "totalPipeline",
           COALESCE(SUM(CASE WHEN o.stage NOT IN ('WON','LOST') THEN COALESCE(o.estimated_value,0) * o.probability / 100.0 ELSE 0 END),0)::float8 AS "weightedPipeline",
           (SELECT COUNT(*)::int FROM crm_follow_ups f
             JOIN crm_opportunities fo ON fo.id=f.opportunity_id
            WHERE fo.customer_id=$4::text AND f.tenant_id=$1::text AND f.company_id=$2::text
              AND ($3::text IS NULL OR f.branch_id=$3::text) AND f.status='OPEN') AS "openFollowUpCount",
           (SELECT COUNT(*)::int FROM crm_follow_ups f
             JOIN crm_opportunities fo ON fo.id=f.opportunity_id
            WHERE fo.customer_id=$4::text AND f.tenant_id=$1::text AND f.company_id=$2::text
              AND ($3::text IS NULL OR f.branch_id=$3::text) AND f.status='OPEN' AND f.due_at<NOW()) AS "overdueFollowUpCount",
           GREATEST(MAX(o.updated_at),
             (SELECT MAX(e.created_at) FROM crm_events e
               JOIN crm_opportunities eo ON eo.id=e.opportunity_id
              WHERE eo.customer_id=$4::text AND e.tenant_id=$1::text AND e.company_id=$2::text
                AND ($3::text IS NULL OR e.branch_id=$3::text))) AS "lastCrmActivityAt"
          FROM crm_opportunities o
         WHERE o.customer_id=$4::text AND o.tenant_id=$1::text AND o.company_id=$2::text
           AND ($3::text IS NULL OR o.branch_id=$3::text)`,
        ...scope,
        customerId,
      ),
      this.prisma.$queryRawUnsafe<OpportunityRow[]>(
        `SELECT id,title,stage,estimated_value AS "estimatedValue",currency,probability,
                expected_close_date AS "expectedCloseDate",updated_at AS "updatedAt"
           FROM crm_opportunities
          WHERE customer_id=$4::text AND tenant_id=$1::text AND company_id=$2::text
            AND ($3::text IS NULL OR branch_id=$3::text)
          ORDER BY updated_at DESC,id DESC
          LIMIT 8`,
        ...scope,
        customerId,
      ),
      this.prisma.$queryRawUnsafe<FollowUpRow[]>(
        `SELECT f.id,f.opportunity_id AS "opportunityId",f.assigned_user_id AS "assignedUserId",
                f.channel,f.status,f.due_at AS "dueAt",f.note,f.version
           FROM crm_follow_ups f
           JOIN crm_opportunities o ON o.id=f.opportunity_id
          WHERE o.customer_id=$4::text AND f.tenant_id=$1::text AND f.company_id=$2::text
            AND ($3::text IS NULL OR f.branch_id=$3::text) AND f.status='OPEN'
          ORDER BY f.due_at,f.id
          LIMIT 8`,
        ...scope,
        customerId,
      ),
      this.prisma.$queryRawUnsafe<EventRow[]>(
        `SELECT e.id,e.opportunity_id AS "opportunityId",e.event_type AS "eventType",e.created_at AS "createdAt"
           FROM crm_events e
           JOIN crm_opportunities o ON o.id=e.opportunity_id
          WHERE o.customer_id=$4::text AND e.tenant_id=$1::text AND e.company_id=$2::text
            AND ($3::text IS NULL OR e.branch_id=$3::text)
          ORDER BY e.created_at DESC,e.id DESC
          LIMIT 10`,
        ...scope,
        customerId,
      ),
    ]);

    return {
      summary: summaryRows[0] ?? {
        opportunityCount: 0,
        openOpportunityCount: 0,
        wonOpportunityCount: 0,
        totalPipeline: 0,
        weightedPipeline: 0,
        openFollowUpCount: 0,
        overdueFollowUpCount: 0,
        lastCrmActivityAt: null,
      },
      opportunities,
      followUps,
      events,
    };
  }
}
