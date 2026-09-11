import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualitySlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async listBreaches(limit = 50) {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const bounded = Math.min(Math.max(limit, 1), 200);

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT q.id,
              q.branch_id AS "branchId",
              q.status,
              q.severity,
              q.title,
              q.assigned_user_id AS "assignedUserId",
              q.sla_due_at AS "slaDueAt",
              q.sla_breached_at AS "slaBreachedAt",
              q.sla_escalation_level AS "slaEscalationLevel"
       FROM quality_cases q
       WHERE q.tenant_id=$1::text
         AND q.company_id=$2::text
         AND ($3::text IS NULL OR q.branch_id=$3::text)
         AND q.sla_breached_at IS NOT NULL
         AND q.status NOT IN ('RESOLVED','CLOSED')
       ORDER BY q.sla_breached_at DESC
       LIMIT $4`,
      tenantId,
      companyId,
      branchId,
      bounded,
    );
  }

  async processOverdue(actorUserId: string, limit = 100) {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const bounded = Math.min(Math.max(limit, 1), 200);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH candidates AS (
         SELECT q.id
         FROM quality_cases q
         WHERE q.tenant_id=$1::text
           AND q.company_id=$2::text
           AND ($3::text IS NULL OR q.branch_id=$3::text)
           AND q.status NOT IN ('RESOLVED','CLOSED')
           AND q.sla_due_at IS NOT NULL
           AND q.sla_due_at < NOW()
           AND q.sla_breached_at IS NULL
         ORDER BY q.sla_due_at ASC
         LIMIT $4
         FOR UPDATE SKIP LOCKED
       ), updated AS (
         UPDATE quality_cases q
         SET sla_breached_at=NOW(),
             sla_escalation_level=GREATEST(q.sla_escalation_level,1),
             updated_by_user_id=$5::text,
             updated_at=NOW()
         FROM candidates c
         WHERE q.id=c.id
         RETURNING q.id,q.tenant_id,q.company_id,q.branch_id,q.status,q.assigned_user_id,q.sla_due_at,q.sla_breached_at,q.sla_escalation_level
       ), events AS (
         INSERT INTO quality_case_events(
           case_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,assigned_user_id,note,actor_user_id
         )
         SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'SLA_BREACHED',u.status,u.status,u.assigned_user_id,
                'SLA due time exceeded', $5::text
         FROM updated u
         ON CONFLICT DO NOTHING
         RETURNING case_id
       )
       SELECT u.id,
              u.branch_id AS "branchId",
              u.status,
              u.assigned_user_id AS "assignedUserId",
              u.sla_due_at AS "slaDueAt",
              u.sla_breached_at AS "slaBreachedAt",
              u.sla_escalation_level AS "slaEscalationLevel"
       FROM updated u
       ORDER BY u.sla_due_at ASC`,
      tenantId,
      companyId,
      branchId,
      bounded,
      actorUserId,
    );

    return {
      processed: rows.length,
      cases: rows,
    };
  }
}
