import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type ReminderScope = 'MINE' | 'TEAM';

type FollowUpReminderRow = {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  assignedUserId: string;
  channel: string;
  dueAt: Date;
  note: string | null;
  version: number;
  subjectLabel: string;
  kind: 'FOLLOW_UP_OVERDUE' | 'FOLLOW_UP_TODAY';
};

type OpportunityReminderRow = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  ownerUserId: string | null;
  title: string;
  stage: string;
  estimatedValue: number | null;
  currency: string;
  probability: number;
  expectedCloseDate: Date | null;
  updatedAt: Date;
  subjectLabel: string;
  kind:
    | 'OPPORTUNITY_CLOSE_OVERDUE'
    | 'OPPORTUNITY_CLOSE_SOON'
    | 'OPPORTUNITY_STALE';
};

@Injectable()
export class CrmReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  async getFeed(filters: {
    scope: ReminderScope;
    userId: string;
    dayStart: Date;
    dayEnd: Date;
    today: string;
    closeThrough: string;
    staleBefore: Date;
    limit?: number;
  }) {
    const context = this.context();
    const ownerUserId = filters.scope === 'MINE' ? filters.userId : null;
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);

    const [followUps, opportunities] = await Promise.all([
      this.prisma.$queryRawUnsafe<FollowUpReminderRow[]>(
        `SELECT f.id,f.lead_id AS "leadId",f.opportunity_id AS "opportunityId",
                f.assigned_user_id AS "assignedUserId",f.channel,f.due_at AS "dueAt",
                f.note,f.version,
                COALESCE(NULLIF(trim(concat_ws(' ',l.first_name,l.last_name)),''),
                         o.title,
                         'Müşteri İlişkileri Kaydı') AS "subjectLabel",
                CASE
                  WHEN f.due_at < NOW() THEN 'FOLLOW_UP_OVERDUE'
                  ELSE 'FOLLOW_UP_TODAY'
                END AS kind
           FROM crm_follow_ups f
           LEFT JOIN crm_leads l
             ON l.id=f.lead_id AND l.tenant_id=f.tenant_id AND l.company_id=f.company_id AND l.branch_id=f.branch_id
           LEFT JOIN crm_opportunities o
             ON o.id=f.opportunity_id AND o.tenant_id=f.tenant_id AND o.company_id=f.company_id AND o.branch_id=f.branch_id
          WHERE f.tenant_id=$1::text AND f.company_id=$2::text
            AND ($3::text IS NULL OR f.branch_id=$3::text)
            AND f.status='OPEN'
            AND ($4::text IS NULL OR f.assigned_user_id=$4::text)
            AND (f.due_at < NOW() OR (f.due_at >= $5::timestamptz AND f.due_at < $6::timestamptz))
          ORDER BY CASE WHEN f.due_at < NOW() THEN 0 ELSE 1 END,f.due_at,f.id
          LIMIT $7`,
        context.tenantId,
        context.companyId,
        context.branchId,
        ownerUserId,
        filters.dayStart,
        filters.dayEnd,
        limit,
      ),
      this.prisma.$queryRawUnsafe<OpportunityReminderRow[]>(
        `SELECT o.id,o.lead_id AS "leadId",o.customer_id AS "customerId",
                o.owner_user_id AS "ownerUserId",o.title,o.stage,
                o.estimated_value AS "estimatedValue",o.currency,o.probability,
                o.expected_close_date AS "expectedCloseDate",o.updated_at AS "updatedAt",
                COALESCE(NULLIF(trim(concat_ws(' ',l.first_name,l.last_name)),''),
                         NULLIF(trim(concat_ws(' ',c."firstName",c."lastName")),''),
                         'Müşteri Bağlantısı Yok') AS "subjectLabel",
                CASE
                  WHEN o.expected_close_date IS NOT NULL AND o.expected_close_date < $5::date THEN 'OPPORTUNITY_CLOSE_OVERDUE'
                  WHEN o.expected_close_date IS NOT NULL AND o.expected_close_date >= $5::date AND o.expected_close_date <= $6::date THEN 'OPPORTUNITY_CLOSE_SOON'
                  ELSE 'OPPORTUNITY_STALE'
                END AS kind
           FROM crm_opportunities o
           LEFT JOIN crm_leads l
             ON l.id=o.lead_id AND l.tenant_id=o.tenant_id AND l.company_id=o.company_id AND l.branch_id=o.branch_id
           LEFT JOIN customers c
             ON c.id=o.customer_id AND c."tenantId"=o.tenant_id AND c."branchId"=o.branch_id
          WHERE o.tenant_id=$1::text AND o.company_id=$2::text
            AND ($3::text IS NULL OR o.branch_id=$3::text)
            AND ($4::text IS NULL OR o.owner_user_id=$4::text)
            AND o.stage NOT IN ('WON','LOST')
            AND (
              (o.expected_close_date IS NOT NULL AND o.expected_close_date < $5::date) OR
              (o.expected_close_date IS NOT NULL AND o.expected_close_date >= $5::date AND o.expected_close_date <= $6::date) OR
              o.updated_at < $7::timestamptz
            )
          ORDER BY
            CASE
              WHEN o.expected_close_date IS NOT NULL AND o.expected_close_date < $5::date THEN 0
              WHEN o.expected_close_date IS NOT NULL AND o.expected_close_date >= $5::date AND o.expected_close_date <= $6::date THEN 1
              ELSE 2
            END,
            COALESCE(o.expected_close_date,$5::date),o.updated_at,o.id
          LIMIT $8`,
        context.tenantId,
        context.companyId,
        context.branchId,
        ownerUserId,
        filters.today,
        filters.closeThrough,
        filters.staleBefore,
        limit,
      ),
    ]);

    const items = [
      ...followUps.map((row) => ({
        ...row,
        category: 'FOLLOW_UP' as const,
        severity: row.kind === 'FOLLOW_UP_OVERDUE' ? ('CRITICAL' as const) : ('HIGH' as const),
      })),
      ...opportunities.map((row) => ({
        ...row,
        category: 'OPPORTUNITY' as const,
        severity:
          row.kind === 'OPPORTUNITY_CLOSE_OVERDUE'
            ? ('CRITICAL' as const)
            : row.kind === 'OPPORTUNITY_CLOSE_SOON'
              ? ('HIGH' as const)
              : ('MEDIUM' as const),
      })),
    ].sort((a, b) => {
      const score = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 } as const;
      return score[a.severity] - score[b.severity];
    });

    return {
      scope: filters.scope,
      generatedAt: new Date(),
      counts: {
        total: items.length,
        critical: items.filter((item) => item.severity === 'CRITICAL').length,
        high: items.filter((item) => item.severity === 'HIGH').length,
        medium: items.filter((item) => item.severity === 'MEDIUM').length,
      },
      items: items.slice(0, limit),
    };
  }
}
