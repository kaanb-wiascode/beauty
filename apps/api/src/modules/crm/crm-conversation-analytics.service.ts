import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class CrmConversationAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  summary(actorUserId: string) {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return this.prisma.$queryRawUnsafe<Array<{
      totalThreads: number;
      unreadThreads: number;
      unreadMessages: number;
      awaitingResponse: number;
      breached2h: number;
      breached24h: number;
      whatsappAwaiting: number;
      smsAwaiting: number;
      emailAwaiting: number;
      oldestAwaitingMinutes: number;
    }>>(
      `WITH scoped AS (
         SELECT m.*,
                CASE WHEN m.customer_id IS NOT NULL THEN 'CUSTOMER'
                     WHEN m.opportunity_id IS NOT NULL THEN 'OPPORTUNITY'
                     ELSE 'LEAD' END AS subject_type,
                COALESCE(m.customer_id,m.opportunity_id,m.lead_id) AS subject_id
         FROM crm_messages m
         WHERE m.tenant_id=$1::text AND m.company_id=$2::text AND m.branch_id=$3::text
           AND COALESCE(m.customer_id,m.opportunity_id,m.lead_id) IS NOT NULL
       ), grouped AS (
         SELECT subject_type,subject_id,
                MAX(created_at) FILTER(WHERE direction='INBOUND') AS last_inbound_at,
                MAX(created_at) FILTER(WHERE direction='OUTBOUND') AS last_outbound_at
         FROM scoped GROUP BY subject_type,subject_id
       ), latest AS (
         SELECT DISTINCT ON(subject_type,subject_id) subject_type,subject_id,channel
         FROM scoped ORDER BY subject_type,subject_id,created_at DESC,id DESC
       ), unread AS (
         SELECT g.subject_type,g.subject_id,
                COUNT(sm.id)::int AS unread_count
         FROM grouped g
         JOIN scoped sm ON sm.subject_type=g.subject_type AND sm.subject_id=g.subject_id AND sm.direction='INBOUND'
         LEFT JOIN crm_conversation_reads r
           ON r.tenant_id=$1::text AND r.company_id=$2::text AND r.branch_id=$3::text AND r.user_id=$4::text
          AND ((g.subject_type='CUSTOMER' AND r.customer_id=g.subject_id)
            OR (g.subject_type='LEAD' AND r.lead_id=g.subject_id)
            OR (g.subject_type='OPPORTUNITY' AND r.opportunity_id=g.subject_id))
         WHERE sm.created_at>COALESCE(r.read_at,'epoch'::timestamptz)
         GROUP BY g.subject_type,g.subject_id
       ), metrics AS (
         SELECT g.*,l.channel,COALESCE(u.unread_count,0) AS unread_count,
                (g.last_inbound_at IS NOT NULL AND (g.last_outbound_at IS NULL OR g.last_inbound_at>g.last_outbound_at)) AS awaiting,
                CASE WHEN g.last_inbound_at IS NOT NULL AND (g.last_outbound_at IS NULL OR g.last_inbound_at>g.last_outbound_at)
                     THEN FLOOR(EXTRACT(EPOCH FROM (NOW()-g.last_inbound_at))/60)::int ELSE 0 END AS age_minutes
         FROM grouped g
         JOIN latest l ON l.subject_type=g.subject_type AND l.subject_id=g.subject_id
         LEFT JOIN unread u ON u.subject_type=g.subject_type AND u.subject_id=g.subject_id
       )
       SELECT COUNT(*)::int AS "totalThreads",
              COUNT(*) FILTER(WHERE unread_count>0)::int AS "unreadThreads",
              COALESCE(SUM(unread_count),0)::int AS "unreadMessages",
              COUNT(*) FILTER(WHERE awaiting)::int AS "awaitingResponse",
              COUNT(*) FILTER(WHERE awaiting AND age_minutes>=120)::int AS "breached2h",
              COUNT(*) FILTER(WHERE awaiting AND age_minutes>=1440)::int AS "breached24h",
              COUNT(*) FILTER(WHERE awaiting AND channel='WHATSAPP')::int AS "whatsappAwaiting",
              COUNT(*) FILTER(WHERE awaiting AND channel='SMS')::int AS "smsAwaiting",
              COUNT(*) FILTER(WHERE awaiting AND channel='EMAIL')::int AS "emailAwaiting",
              COALESCE(MAX(age_minutes) FILTER(WHERE awaiting),0)::int AS "oldestAwaitingMinutes"
       FROM metrics`,
      context.tenantId,
      context.companyId,
      context.branchId,
      actorUserId,
    ).then((rows) => rows[0] ?? {
      totalThreads: 0, unreadThreads: 0, unreadMessages: 0, awaitingResponse: 0,
      breached2h: 0, breached24h: 0, whatsappAwaiting: 0, smsAwaiting: 0,
      emailAwaiting: 0, oldestAwaitingMinutes: 0,
    });
  }
}
