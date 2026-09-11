import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { createHmac, timingSafeEqual } from 'crypto';

export type PublicFeedbackClassification = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

@Injectable()
export class QualityPublicFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async issueToken(feedbackRequestId: string) {
    const secret = this.secret();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      publicTokenVersion: number;
      expiresEpoch: string;
      expiresAt: Date;
    }>>(
      `UPDATE quality_feedback_requests
       SET expires_at=COALESCE(expires_at,NOW()+INTERVAL '14 days'),
           updated_at=NOW()
       WHERE id=$1::text
         AND status IN ('PENDING','SENT','OPENED')
         AND submitted_at IS NULL
         AND cancelled_at IS NULL
         AND token_consumed_at IS NULL
       RETURNING id,
                 public_token_version AS "publicTokenVersion",
                 FLOOR(EXTRACT(EPOCH FROM expires_at))::bigint::text AS "expiresEpoch",
                 expires_at AS "expiresAt"`,
      feedbackRequestId,
    );
    if (!rows.length) {
      throw new BadRequestException('Feedback request is not available for delivery.');
    }
    const row = rows[0];
    return {
      token: this.sign(row.id, row.publicTokenVersion, row.expiresEpoch, secret),
      expiresAt: row.expiresAt,
    };
  }

  async open(token: string) {
    const parsed = this.verify(token);
    this.assertNotExpired(parsed.expiresEpoch);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH eligible AS (
         SELECT r.id,r.status,r.branch_id,r.service_id,r.expires_at,r.opened_at,r.token_consumed_at
         FROM quality_feedback_requests r
         WHERE r.id=$1::text
           AND r.public_token_version=$2::int
           AND r.expires_at >= NOW()
           AND r.cancelled_at IS NULL
           AND r.status IN ('PENDING','SENT','OPENED','SUBMITTED')
         LIMIT 1
       ), opened AS (
         UPDATE quality_feedback_requests r
         SET status='OPENED',opened_at=COALESCE(r.opened_at,NOW()),updated_at=NOW()
         FROM eligible e
         WHERE r.id=e.id
           AND e.status IN ('PENDING','SENT','OPENED')
           AND e.token_consumed_at IS NULL
         RETURNING r.id,r.branch_id,r.opened_at
       ), event_insert AS (
         INSERT INTO quality_feedback_request_events(
           feedback_request_id,tenant_id,company_id,branch_id,event_type,actor_user_id,created_at
         )
         SELECT r.id,r.tenant_id,r.company_id,r.branch_id,'OPENED',NULL,NOW()
         FROM quality_feedback_requests r
         JOIN opened o ON o.id=r.id
         WHERE NOT EXISTS (
           SELECT 1 FROM quality_feedback_request_events existing
           WHERE existing.feedback_request_id=r.id AND existing.event_type='OPENED'
         )
         RETURNING feedback_request_id
       )
       SELECT e.status,
              e.expires_at AS "expiresAt",
              b.name AS "branchName",
              s.name AS "serviceName",
              CASE WHEN e.status='SUBMITTED' OR e.token_consumed_at IS NOT NULL THEN false ELSE true END AS "canSubmit"
       FROM eligible e
       JOIN branches b ON b.id=e.branch_id
       JOIN services s ON s.id=e.service_id
       LIMIT 1`,
      parsed.requestId,
      parsed.version,
    );

    if (!rows.length) this.invalidLink();
    return rows[0];
  }

  async submit(token: string, input: { rating: number; comment?: string | null }) {
    const parsed = this.verify(token);
    this.assertNotExpired(parsed.expiresEpoch);
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('rating must be an integer from 1 to 5.');
    }
    const comment = input.comment?.trim() || null;
    if (comment && comment.length > 4000) {
      throw new BadRequestException('comment must be 4000 characters or fewer.');
    }
    const classification = this.classify(input.rating);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH request_row AS (
         SELECT r.*
         FROM quality_feedback_requests r
         WHERE r.id=$1::text
           AND r.public_token_version=$5::int
           AND r.expires_at >= NOW()
           AND r.cancelled_at IS NULL
           AND r.status IN ('PENDING','SENT','OPENED','SUBMITTED')
         FOR UPDATE
       ), existing_feedback AS (
         SELECT f.id,f.classification,f.overall_rating
         FROM request_row r
         JOIN customer_feedback f ON f.id=r.feedback_id
         WHERE r.status='SUBMITTED' AND r.feedback_id IS NOT NULL
       ), inserted_feedback AS (
         INSERT INTO customer_feedback(
           tenant_id,company_id,branch_id,customer_id,appointment_id,service_id,staff_id,
           source,classification,overall_rating,comment,created_by_user_id,submitted_at,created_at,updated_at
         )
         SELECT r.tenant_id,r.company_id,r.branch_id,r.customer_id,r.appointment_id,r.service_id,a."staffId",
                'CUSTOMER_PORTAL',$2,$3::int,$4,NULL,NOW(),NOW(),NOW()
         FROM request_row r
         LEFT JOIN appointments a
           ON a.id=r.appointment_id
          AND a."tenantId"=r.tenant_id
          AND a."branchId"=r.branch_id
         WHERE r.status IN ('PENDING','SENT','OPENED')
           AND r.token_consumed_at IS NULL
         RETURNING id,tenant_id,company_id,branch_id,customer_id,appointment_id,service_id,staff_id,
                   classification,overall_rating,comment
       ), request_update AS (
         UPDATE quality_feedback_requests r
         SET status='SUBMITTED',submitted_at=NOW(),token_consumed_at=NOW(),feedback_id=f.id,updated_at=NOW()
         FROM inserted_feedback f
         WHERE r.id=$1::text
         RETURNING r.id,r.tenant_id,r.company_id,r.branch_id,r.created_by_user_id,r.feedback_id
       ), request_event AS (
         INSERT INTO quality_feedback_request_events(
           feedback_request_id,tenant_id,company_id,branch_id,event_type,actor_user_id,created_at
         )
         SELECT u.id,u.tenant_id,u.company_id,u.branch_id,'SUBMITTED',NULL,NOW()
         FROM request_update u
         RETURNING feedback_request_id
       ), case_insert AS (
         INSERT INTO quality_cases(
           tenant_id,company_id,branch_id,feedback_id,customer_id,appointment_id,service_id,staff_id,
           source_type,category,severity,status,title,description,created_by_user_id,updated_by_user_id,
           opened_at,created_at,updated_at
         )
         SELECT f.tenant_id,f.company_id,f.branch_id,f.id,f.customer_id,f.appointment_id,f.service_id,f.staff_id,
                'FEEDBACK','CUSTOMER_FEEDBACK',
                CASE WHEN f.overall_rating=1 THEN 'HIGH' ELSE 'MEDIUM' END,
                'OPEN','Müşteri geri bildirimi kalite incelemesi',f.comment,
                u.created_by_user_id,u.created_by_user_id,NOW(),NOW(),NOW()
         FROM inserted_feedback f
         JOIN request_update u ON u.feedback_id=f.id
         WHERE f.classification='NEGATIVE'
           AND u.created_by_user_id IS NOT NULL
         ON CONFLICT (feedback_id) WHERE feedback_id IS NOT NULL DO NOTHING
         RETURNING id,feedback_id,tenant_id,company_id,branch_id,created_by_user_id
       ), case_event AS (
         INSERT INTO quality_case_events(
           case_id,tenant_id,company_id,branch_id,event_type,to_status,actor_user_id,note,created_at
         )
         SELECT c.id,c.tenant_id,c.company_id,c.branch_id,'CREATED','OPEN',c.created_by_user_id,
                'AUTO_ESCALATED_PUBLIC_FEEDBACK',NOW()
         FROM case_insert c
         RETURNING case_id
       ), result_rows AS (
         SELECT f.id AS feedback_id,f.classification,f.overall_rating,false AS duplicate,
                EXISTS(SELECT 1 FROM case_insert c WHERE c.feedback_id=f.id) AS escalated
         FROM inserted_feedback f
         UNION ALL
         SELECT f.id,f.classification,f.overall_rating,true AS duplicate,
                EXISTS(SELECT 1 FROM quality_cases q WHERE q.feedback_id=f.id) AS escalated
         FROM existing_feedback f
       )
       SELECT feedback_id AS "feedbackId",classification,overall_rating AS rating,duplicate,escalated
       FROM result_rows
       LIMIT 1`,
      parsed.requestId,
      classification,
      input.rating,
      comment,
      parsed.version,
    );

    if (!rows.length) this.invalidLink();
    return {
      submitted: true,
      classification: rows[0].classification,
      rating: rows[0].rating,
      duplicate: rows[0].duplicate,
      escalated: rows[0].escalated,
    };
  }

  private classify(rating: number): PublicFeedbackClassification {
    if (rating <= 2) return 'NEGATIVE';
    if (rating === 3) return 'NEUTRAL';
    return 'POSITIVE';
  }

  private secret(): string {
    const secret = this.config.get<string>('QUALITY_FEEDBACK_PUBLIC_TOKEN_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Public feedback token signing is not configured.');
    }
    return secret;
  }

  private sign(requestId: string, version: number, expiresEpoch: string, secret: string): string {
    const encodedId = Buffer.from(requestId, 'utf8').toString('base64url');
    const payload = `v1.${encodedId}.${version}.${expiresEpoch}`;
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verify(token: string): { requestId: string; version: number; expiresEpoch: string } {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 5 || parts[0] !== 'v1') this.invalidLink();
    const [, encodedId, versionRaw, expiresEpoch, signature] = parts;
    const version = Number(versionRaw);
    if (!encodedId || !Number.isInteger(version) || version < 1 || !/^\d{10,13}$/.test(expiresEpoch)) {
      this.invalidLink();
    }

    let requestId = '';
    try {
      requestId = Buffer.from(encodedId, 'base64url').toString('utf8');
    } catch {
      this.invalidLink();
    }
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) this.invalidLink();

    const payload = `v1.${encodedId}.${version}.${expiresEpoch}`;
    const expected = createHmac('sha256', this.secret()).update(payload).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'base64url');
    } catch {
      this.invalidLink();
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) this.invalidLink();
    return { requestId, version, expiresEpoch };
  }

  private assertNotExpired(expiresEpoch: string) {
    const seconds = Number(expiresEpoch);
    if (!Number.isFinite(seconds) || seconds * 1000 < Date.now()) this.invalidLink();
  }

  private invalidLink(): never {
    throw new BadRequestException('Feedback link is invalid or no longer available.');
  }
}
