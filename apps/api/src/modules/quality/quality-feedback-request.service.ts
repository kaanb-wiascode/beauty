import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type FeedbackRequestStatus =
  | 'PENDING'
  | 'SENT'
  | 'OPENED'
  | 'SUBMITTED'
  | 'CANCELLED';

@Injectable()
export class QualityFeedbackRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(input: { status?: FeedbackRequestStatus; limit?: number }) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    const limit = this.normalizeLimit(input.limit);

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         r.id,
         r.appointment_id AS "appointmentId",
         r.customer_id AS "customerId",
         r.service_id AS "serviceId",
         r.branch_id AS "branchId",
         r.status,
         r.requested_at AS "requestedAt",
         r.sent_at AS "sentAt",
         r.opened_at AS "openedAt",
         r.submitted_at AS "submittedAt",
         r.expires_at AS "expiresAt",
         r.created_at AS "createdAt"
       FROM quality_feedback_requests r
       WHERE r.tenant_id=$1::text
         AND r.company_id=$2::text
         AND ($3::text IS NULL OR r.branch_id=$3::text)
         AND ($4::text IS NULL OR r.status=$4::text)
       ORDER BY r.requested_at DESC
       LIMIT $5::int`,
      tenantId,
      companyId,
      branchId,
      input.status ?? null,
      limit,
    );
  }

  async processCompletedAppointments(actorUserId: string, requestedLimit?: number) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    const limit = this.normalizeLimit(requestedLimit);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH candidates AS (
         SELECT
           a.id AS appointment_id,
           a."branchId" AS branch_id,
           a."customerId" AS customer_id,
           a."serviceId" AS service_id
         FROM appointments a
         JOIN branches b
           ON b.id=a."branchId"
          AND b."companyId"=$2::text
          AND b.status='ACTIVE'
         WHERE a."tenantId"=$1::text
           AND a.status='COMPLETED'
           AND ($3::text IS NULL OR a."branchId"=$3::text)
           AND NOT EXISTS (
             SELECT 1
             FROM quality_feedback_requests existing
             WHERE existing.appointment_id=a.id
           )
         ORDER BY a."updatedAt" ASC, a.id ASC
         FOR UPDATE OF a SKIP LOCKED
         LIMIT $5::int
       ), inserted AS (
         INSERT INTO quality_feedback_requests (
           tenant_id,
           company_id,
           branch_id,
           appointment_id,
           customer_id,
           service_id,
           status,
           requested_at,
           created_by_user_id,
           created_at,
           updated_at
         )
         SELECT
           $1::text,
           $2::text,
           c.branch_id,
           c.appointment_id,
           c.customer_id,
           c.service_id,
           'PENDING',
           NOW(),
           $4::text,
           NOW(),
           NOW()
         FROM candidates c
         ON CONFLICT (appointment_id) DO NOTHING
         RETURNING id, appointment_id, customer_id, service_id, branch_id, status, requested_at
       ), events AS (
         INSERT INTO quality_feedback_request_events (
           feedback_request_id,
           tenant_id,
           company_id,
           branch_id,
           event_type,
           actor_user_id,
           created_at
         )
         SELECT
           i.id,
           $1::text,
           $2::text,
           i.branch_id,
           'REQUESTED',
           $4::text,
           NOW()
         FROM inserted i
         RETURNING feedback_request_id
       )
       SELECT
         i.id,
         i.appointment_id AS "appointmentId",
         i.customer_id AS "customerId",
         i.service_id AS "serviceId",
         i.branch_id AS "branchId",
         i.status,
         i.requested_at AS "requestedAt"
       FROM inserted i
       ORDER BY i.requested_at ASC`,
      tenantId,
      companyId,
      branchId,
      actorUserId,
      limit,
    );

    return {
      processed: rows.length,
      requests: rows,
    };
  }

  private normalizeLimit(value?: number): number {
    if (value === undefined) return 100;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return Math.min(value, 200);
  }
}
