import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { createHash, randomBytes } from 'crypto';
import { TenantContext } from '../../common/tenant/tenant-context';

export type QualityNotificationOutboxStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'RETRY'
  | 'SENT'
  | 'DEAD'
  | 'CANCELLED';

@Injectable()
export class QualityNotificationOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async enqueueFeedbackRequests(actorUserId: string, requestedLimit?: number) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    const limit = this.normalizeLimit(requestedLimit);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH candidates AS (
         SELECT r.id, r.branch_id, r.customer_id
         FROM quality_feedback_requests r
         WHERE r.tenant_id=$1::text
           AND r.company_id=$2::text
           AND ($3::text IS NULL OR r.branch_id=$3::text)
           AND r.status='PENDING'
           AND NOT EXISTS (
             SELECT 1 FROM quality_notification_outbox o
             WHERE o.feedback_request_id=r.id
           )
         ORDER BY r.requested_at ASC, r.id ASC
         FOR UPDATE OF r SKIP LOCKED
         LIMIT $5::int
       ), inserted AS (
         INSERT INTO quality_notification_outbox (
           tenant_id,company_id,branch_id,feedback_request_id,customer_id,
           notification_type,status,attempt_count,next_attempt_at,created_by_user_id,created_at,updated_at
         )
         SELECT $1::text,$2::text,c.branch_id,c.id,c.customer_id,
                'FEEDBACK_REQUEST','PENDING',0,NOW(),$4::text,NOW(),NOW()
         FROM candidates c
         ON CONFLICT (feedback_request_id) DO NOTHING
         RETURNING id,feedback_request_id,customer_id,branch_id,status,next_attempt_at
       ), events AS (
         INSERT INTO quality_notification_outbox_events (
           outbox_id,tenant_id,company_id,branch_id,event_type,actor_user_id,created_at
         )
         SELECT i.id,$1::text,$2::text,i.branch_id,'ENQUEUED',$4::text,NOW()
         FROM inserted i
         RETURNING outbox_id
       )
       SELECT id,
              feedback_request_id AS "feedbackRequestId",
              customer_id AS "customerId",
              branch_id AS "branchId",
              status,
              next_attempt_at AS "nextAttemptAt"
       FROM inserted
       ORDER BY next_attempt_at ASC`,
      tenantId,
      companyId,
      branchId,
      actorUserId,
      limit,
    );

    return { enqueued: rows.length, deliveries: rows };
  }

  async claim(actorUserId: string, requestedLimit?: number, requestedLeaseSeconds?: number) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    const limit = this.normalizeLimit(requestedLimit);
    const leaseSeconds = this.normalizeLeaseSeconds(requestedLeaseSeconds);
    const claimToken = randomBytes(32).toString('hex');
    const claimTokenHash = this.hashToken(claimToken);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH candidates AS (
         SELECT o.id
         FROM quality_notification_outbox o
         WHERE o.tenant_id=$1::text
           AND o.company_id=$2::text
           AND ($3::text IS NULL OR o.branch_id=$3::text)
           AND o.status IN ('PENDING','RETRY')
           AND o.next_attempt_at <= NOW()
           AND o.attempt_count < 5
         ORDER BY o.next_attempt_at ASC, o.created_at ASC, o.id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $6::int
       ), claimed AS (
         UPDATE quality_notification_outbox o
         SET status='CLAIMED',
             attempt_count=o.attempt_count+1,
             lease_until=NOW()+make_interval(secs => $7::int),
             claim_token_hash=$5::text,
             claimed_by_user_id=$4::text,
             updated_at=NOW()
         FROM candidates c
         WHERE o.id=c.id
         RETURNING o.id,o.feedback_request_id,o.customer_id,o.branch_id,o.attempt_count,o.lease_until
       ), events AS (
         INSERT INTO quality_notification_outbox_events (
           outbox_id,tenant_id,company_id,branch_id,event_type,attempt_number,actor_user_id,created_at
         )
         SELECT c.id,$1::text,$2::text,c.branch_id,'CLAIMED',c.attempt_count,$4::text,NOW()
         FROM claimed c
         RETURNING outbox_id
       )
       SELECT c.id,
              c.feedback_request_id AS "feedbackRequestId",
              c.customer_id AS "customerId",
              c.branch_id AS "branchId",
              c.attempt_count AS "attemptCount",
              c.lease_until AS "leaseUntil"
       FROM claimed c
       ORDER BY c.id ASC`,
      tenantId,
      companyId,
      branchId,
      actorUserId,
      claimTokenHash,
      limit,
      leaseSeconds,
    );

    return { claimToken, claimed: rows.length, deliveries: rows };
  }

  async markSent(
    id: string,
    claimToken: string,
    actorUserId: string,
    providerMessageId?: string | null,
  ) {
    const { tenantId, companyId } = this.tenantContext.getContext();
    const tokenHash = this.hashToken(claimToken);
    const providerId = providerMessageId?.trim() || null;
    if (providerId && providerId.length > 200) {
      throw new BadRequestException('providerMessageId is too long');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH updated AS (
         UPDATE quality_notification_outbox o
         SET status='SENT',
             sent_at=NOW(),
             provider_message_id=$6::text,
             claim_token_hash=NULL,
             lease_until=NULL,
             updated_at=NOW()
         WHERE o.id=$3::text
           AND o.tenant_id=$1::text
           AND o.company_id=$2::text
           AND o.status='CLAIMED'
           AND o.lease_until >= NOW()
           AND o.claim_token_hash=$4::text
         RETURNING o.id,o.feedback_request_id,o.branch_id,o.attempt_count,o.sent_at
       ), request_update AS (
         UPDATE quality_feedback_requests r
         SET status='SENT',sent_at=COALESCE(r.sent_at,u.sent_at),updated_at=NOW()
         FROM updated u
         WHERE r.id=u.feedback_request_id
           AND r.tenant_id=$1::text
           AND r.company_id=$2::text
           AND r.status='PENDING'
         RETURNING r.id,r.branch_id,r.sent_at
       ), request_event AS (
         INSERT INTO quality_feedback_request_events (
           feedback_request_id,tenant_id,company_id,branch_id,event_type,actor_user_id,created_at
         )
         SELECT r.id,$1::text,$2::text,r.branch_id,'SENT',$5::text,NOW()
         FROM request_update r
         RETURNING feedback_request_id
       ), outbox_event AS (
         INSERT INTO quality_notification_outbox_events (
           outbox_id,tenant_id,company_id,branch_id,event_type,attempt_number,actor_user_id,created_at
         )
         SELECT u.id,$1::text,$2::text,u.branch_id,'SENT',u.attempt_count,$5::text,NOW()
         FROM updated u
         RETURNING outbox_id
       )
       SELECT u.id,u.feedback_request_id AS "feedbackRequestId",u.sent_at AS "sentAt"
       FROM updated u`,
      tenantId,
      companyId,
      id,
      tokenHash,
      actorUserId,
      providerId,
    );

    if (!rows.length) {
      throw new BadRequestException('Notification claim is invalid or expired.');
    }
    return rows[0];
  }

  async markFailed(id: string, claimToken: string, actorUserId: string, errorCode: string) {
    const { tenantId, companyId } = this.tenantContext.getContext();
    const tokenHash = this.hashToken(claimToken);
    const safeErrorCode = this.normalizeErrorCode(errorCode);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH updated AS (
         UPDATE quality_notification_outbox o
         SET status=CASE WHEN o.attempt_count >= 5 THEN 'DEAD' ELSE 'RETRY' END,
             next_attempt_at=CASE
               WHEN o.attempt_count >= 5 THEN o.next_attempt_at
               WHEN o.attempt_count=1 THEN NOW()+INTERVAL '1 minute'
               WHEN o.attempt_count=2 THEN NOW()+INTERVAL '5 minutes'
               WHEN o.attempt_count=3 THEN NOW()+INTERVAL '15 minutes'
               ELSE NOW()+INTERVAL '60 minutes'
             END,
             last_error_code=$6::text,
             claim_token_hash=NULL,
             lease_until=NULL,
             updated_at=NOW()
         WHERE o.id=$3::text
           AND o.tenant_id=$1::text
           AND o.company_id=$2::text
           AND o.status='CLAIMED'
           AND o.lease_until >= NOW()
           AND o.claim_token_hash=$4::text
         RETURNING o.id,o.feedback_request_id,o.branch_id,o.status,o.attempt_count,o.next_attempt_at
       ), event_insert AS (
         INSERT INTO quality_notification_outbox_events (
           outbox_id,tenant_id,company_id,branch_id,event_type,attempt_number,error_code,actor_user_id,created_at
         )
         SELECT u.id,$1::text,$2::text,u.branch_id,
                CASE WHEN u.status='DEAD' THEN 'DEAD' ELSE 'FAILED' END,
                u.attempt_count,$6::text,$5::text,NOW()
         FROM updated u
         RETURNING outbox_id
       )
       SELECT id,feedback_request_id AS "feedbackRequestId",status,
              attempt_count AS "attemptCount",next_attempt_at AS "nextAttemptAt"
       FROM updated`,
      tenantId,
      companyId,
      id,
      tokenHash,
      actorUserId,
      safeErrorCode,
    );

    if (!rows.length) {
      throw new BadRequestException('Notification claim is invalid or expired.');
    }
    return rows[0];
  }

  async list(input: { status?: QualityNotificationOutboxStatus; limit?: number }) {
    const { tenantId, companyId, branchId } = this.tenantContext.getContext();
    const limit = this.normalizeLimit(input.limit);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,feedback_request_id AS "feedbackRequestId",customer_id AS "customerId",
              branch_id AS "branchId",status,attempt_count AS "attemptCount",
              next_attempt_at AS "nextAttemptAt",lease_until AS "leaseUntil",sent_at AS "sentAt",
              last_error_code AS "lastErrorCode",created_at AS "createdAt"
       FROM quality_notification_outbox
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND ($4::text IS NULL OR status=$4::text)
       ORDER BY created_at DESC
       LIMIT $5::int`,
      tenantId,
      companyId,
      branchId,
      input.status ?? null,
      limit,
    );
  }

  private hashToken(token: string): string {
    if (!token || token.length < 32) throw new BadRequestException('claimToken is invalid');
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeLimit(value?: number): number {
    if (value === undefined) return 100;
    if (!Number.isInteger(value) || value < 1) throw new BadRequestException('limit must be a positive integer');
    return Math.min(value, 200);
  }

  private normalizeLeaseSeconds(value?: number): number {
    if (value === undefined) return 120;
    if (!Number.isInteger(value) || value < 30 || value > 900) {
      throw new BadRequestException('leaseSeconds must be between 30 and 900');
    }
    return value;
  }

  private normalizeErrorCode(value: string): string {
    const code = String(value ?? '').trim().toUpperCase();
    if (!code || code.length > 80 || !/^[A-Z0-9_.:-]+$/.test(code)) {
      throw new BadRequestException('errorCode is invalid');
    }
    return code;
  }
}
