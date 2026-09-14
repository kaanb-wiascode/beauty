import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type SubjectType = 'CUSTOMER' | 'LEAD' | 'OPPORTUNITY';

type Scope = { tenantId: string; companyId: string; branchId: string };

@Injectable()
export class CrmConversationService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private scope(): Scope {
    const context = this.tenantContext.getContext();
    if (!context.branchId) throw new BadRequestException('Active branch is required.');
    return { tenantId: context.tenantId, companyId: context.companyId, branchId: context.branchId };
  }

  list(actorUserId: string, limit = 100) {
    const scope = this.scope();
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe(
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
                COUNT(*)::int AS message_count,
                COUNT(*) FILTER(WHERE direction='INBOUND')::int AS inbound_count,
                COUNT(*) FILTER(WHERE direction='OUTBOUND')::int AS outbound_count,
                MAX(created_at) AS last_message_at,
                MAX(created_at) FILTER(WHERE direction='INBOUND') AS last_inbound_at,
                MAX(created_at) FILTER(WHERE direction='OUTBOUND') AS last_outbound_at,
                ARRAY_AGG(DISTINCT channel ORDER BY channel) AS channels
         FROM scoped GROUP BY subject_type,subject_id
       ), latest AS (
         SELECT DISTINCT ON(subject_type,subject_id)
                subject_type,subject_id,id AS last_message_id,direction AS last_direction,channel AS last_channel,
                status AS last_status,body AS last_body,subject AS last_subject,recipient AS last_recipient
         FROM scoped ORDER BY subject_type,subject_id,created_at DESC,id DESC
       )
       SELECT g.subject_type AS "subjectType",g.subject_id AS "subjectId",
              COALESCE(c."firstName" || ' ' || c."lastName",l.first_name || ' ' || l.last_name,o.title,'CRM Konuşması') AS "subjectLabel",
              g.message_count AS "messageCount",g.inbound_count AS "inboundCount",g.outbound_count AS "outboundCount",
              g.channels,g.last_message_at AS "lastMessageAt",g.last_inbound_at AS "lastInboundAt",g.last_outbound_at AS "lastOutboundAt",
              latest.last_message_id AS "lastMessageId",latest.last_direction AS "lastDirection",latest.last_channel AS "lastChannel",
              latest.last_status AS "lastStatus",latest.last_body AS "lastBody",latest.last_subject AS "lastSubject",latest.last_recipient AS "lastRecipient",
              COALESCE(unread.count,0)::int AS "unreadCount",
              (g.last_inbound_at IS NOT NULL AND (g.last_outbound_at IS NULL OR g.last_inbound_at > g.last_outbound_at)) AS "awaitingResponse",
              CASE WHEN g.last_inbound_at IS NOT NULL AND (g.last_outbound_at IS NULL OR g.last_inbound_at > g.last_outbound_at)
                   THEN FLOOR(EXTRACT(EPOCH FROM (NOW()-g.last_inbound_at))/60)::int ELSE 0 END AS "responseAgeMinutes"
       FROM grouped g
       JOIN latest ON latest.subject_type=g.subject_type AND latest.subject_id=g.subject_id
       LEFT JOIN customers c ON g.subject_type='CUSTOMER' AND c.id=g.subject_id AND c."tenantId"=$1::text AND c."branchId"=$3::text
       LEFT JOIN crm_leads l ON g.subject_type='LEAD' AND l.id=g.subject_id AND l.tenant_id=$1::text AND l.company_id=$2::text AND l.branch_id=$3::text
       LEFT JOIN crm_opportunities o ON g.subject_type='OPPORTUNITY' AND o.id=g.subject_id AND o.tenant_id=$1::text AND o.company_id=$2::text AND o.branch_id=$3::text
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS count FROM scoped sm
         LEFT JOIN crm_conversation_reads r
           ON r.tenant_id=$1::text AND r.company_id=$2::text AND r.branch_id=$3::text AND r.user_id=$4::text
          AND ((g.subject_type='CUSTOMER' AND r.customer_id=g.subject_id)
            OR (g.subject_type='LEAD' AND r.lead_id=g.subject_id)
            OR (g.subject_type='OPPORTUNITY' AND r.opportunity_id=g.subject_id))
         WHERE sm.subject_type=g.subject_type AND sm.subject_id=g.subject_id AND sm.direction='INBOUND'
           AND sm.created_at>COALESCE(r.read_at,'epoch'::timestamptz)
       ) unread ON TRUE
       ORDER BY (COALESCE(unread.count,0)>0) DESC,
                (g.last_inbound_at IS NOT NULL AND (g.last_outbound_at IS NULL OR g.last_inbound_at>g.last_outbound_at)) DESC,
                g.last_message_at DESC
       LIMIT $5`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      actorUserId,
      safeLimit,
    );
  }

  async detail(subjectType: SubjectType, subjectId: string, actorUserId: string, limit = 200) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    const safeLimit = Math.min(Math.max(limit, 1), 300);
    const column = this.subjectColumn(subjectType);
    const messages = await this.prisma.$queryRawUnsafe(
      `SELECT id,direction,channel,status,provider_key AS "providerKey",recipient,subject,body,
              external_message_id AS "externalMessageId",error_message AS "errorMessage",sent_at AS "sentAt",
              delivered_at AS "deliveredAt",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM crm_messages
       WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND ${column}=$4::text
       ORDER BY created_at ASC,id ASC LIMIT $5`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      subjectId,
      safeLimit,
    );
    await this.markReadInternal(scope, subjectType, subjectId, actorUserId);
    return { subjectType, subjectId, messages };
  }

  async markRead(subjectType: SubjectType, subjectId: string, actorUserId: string) {
    const scope = this.scope();
    await this.assertSubject(scope, subjectType, subjectId);
    await this.markReadInternal(scope, subjectType, subjectId, actorUserId);
    return { subjectType, subjectId, readAt: new Date().toISOString() };
  }

  private markReadInternal(scope: Scope, subjectType: SubjectType, subjectId: string, actorUserId: string) {
    const column = this.subjectColumn(subjectType);
    return this.prisma.$executeRawUnsafe(
      `INSERT INTO crm_conversation_reads(tenant_id,company_id,branch_id,user_id,${column},read_at)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,NOW())
       ON CONFLICT(tenant_id,company_id,branch_id,user_id,${column}) WHERE ${column} IS NOT NULL
       DO UPDATE SET read_at=NOW(),updated_at=NOW()`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      actorUserId,
      subjectId,
    );
  }

  private subjectColumn(type: SubjectType) {
    if (type === 'CUSTOMER') return 'customer_id';
    if (type === 'LEAD') return 'lead_id';
    return 'opportunity_id';
  }

  private async assertSubject(scope: Scope, type: SubjectType, id: string) {
    const rows = type === 'CUSTOMER'
      ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM customers WHERE id=$4::text AND "tenantId"=$1::text AND "branchId"=$3::text LIMIT 1`,
          scope.tenantId,scope.companyId,scope.branchId,id,
        )
      : type === 'LEAD'
        ? await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM crm_leads WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
            scope.tenantId,scope.companyId,scope.branchId,id,
          )
        : await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM crm_opportunities WHERE id=$4::text AND tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text LIMIT 1`,
            scope.tenantId,scope.companyId,scope.branchId,id,
          );
    if (!rows[0]) throw new NotFoundException('Conversation subject not found in active branch.');
  }
}
