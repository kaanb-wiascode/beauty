import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualityInspectionSchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async processDue(actorUserId: string, input: { limit?: number; workerId?: string } = {}) {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const workerId = (input.workerId?.trim() || `quality-inspection-scheduler:${actorUserId}`).slice(0, 120);

    const schedules = await this.prisma.$transaction(async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `WITH candidates AS (
           SELECT s.id
           FROM quality_inspection_schedules s
           WHERE s.tenant_id=$1::text
             AND s.company_id=$2::text
             AND ($3::text IS NULL OR s.branch_id=$3::text)
             AND s.is_active=true
             AND s.next_due_at <= NOW()
             AND UPPER(s.cadence) IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')
             AND (s.lease_expires_at IS NULL OR s.lease_expires_at < NOW())
           ORDER BY s.next_due_at ASC
           LIMIT $4
           FOR UPDATE SKIP LOCKED
         ), leased AS (
           UPDATE quality_inspection_schedules s
           SET lease_owner=$5,
               lease_expires_at=NOW()+INTERVAL '10 minutes',
               updated_at=NOW()
           FROM candidates c
           WHERE s.id=c.id
           RETURNING s.id,s.tenant_id,s.company_id,s.branch_id,s.template_id,s.assignee_user_id,s.cadence,s.next_due_at
         ), planned AS (
           INSERT INTO quality_inspections(
             tenant_id,company_id,branch_id,template_id,schedule_id,idempotency_key,planned_for,inspector_user_id,created_by_user_id,updated_by_user_id
           )
           SELECT l.tenant_id,l.company_id,l.branch_id,l.template_id,l.id,
                  CONCAT('inspection-schedule:',l.id,':',EXTRACT(EPOCH FROM l.next_due_at)::bigint),
                  l.next_due_at,l.assignee_user_id,$6::text,$6::text
           FROM leased l
           ON CONFLICT (tenant_id,company_id,idempotency_key) DO NOTHING
           RETURNING id,schedule_id
         ), advanced AS (
           UPDATE quality_inspection_schedules s
           SET last_planned_at=l.next_due_at,
               next_due_at=CASE UPPER(l.cadence)
                 WHEN 'DAILY' THEN l.next_due_at+INTERVAL '1 day'
                 WHEN 'WEEKLY' THEN l.next_due_at+INTERVAL '1 week'
                 WHEN 'MONTHLY' THEN l.next_due_at+INTERVAL '1 month'
                 WHEN 'QUARTERLY' THEN l.next_due_at+INTERVAL '3 months'
               END,
               lease_owner=NULL,
               lease_expires_at=NULL,
               last_error=NULL,
               updated_at=NOW()
           FROM leased l
           WHERE s.id=l.id
           RETURNING s.id,s.branch_id,s.template_id,s.cadence,s.last_planned_at,s.next_due_at
         )
         SELECT a.id AS "scheduleId",
                a.branch_id AS "branchId",
                a.template_id AS "templateId",
                a.cadence,
                a.last_planned_at AS "plannedFor",
                a.next_due_at AS "nextDueAt",
                p.id AS "inspectionId",
                (p.id IS NULL) AS "duplicate"
         FROM advanced a
         LEFT JOIN planned p ON p.schedule_id=a.id
         ORDER BY a.last_planned_at ASC`,
        tenantId,
        companyId,
        branchId,
        limit,
        workerId,
        actorUserId,
      );
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { processed: schedules.length, schedules };
  }
}
