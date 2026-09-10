import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PosWebhookService } from './pos-webhook.service';

const MAX_RETRY_COUNT = 8;
const MAX_BACKOFF_MINUTES = 6 * 60;

type QueueRow = {
  id: string;
  retryCount: number;
  status: string;
};

@Injectable()
export class PosWebhookQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly webhooks: PosWebhookService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async list(status?: string, limit = 100) {
    const ctx = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,integration_id AS "integrationId",provider,external_event_id AS "externalEventId",
              event_type AS "eventType",status,retry_count AS "retryCount",next_retry_at AS "nextRetryAt",
              last_attempt_at AS "lastAttemptAt",dead_letter_at AS "deadLetterAt",
              replay_requested_at AS "replayRequestedAt",pos_transaction_id AS "posTransactionId",
              processing_result AS "processingResult",error_message AS "errorMessage",created_at AS "createdAt",
              processed_at AS "processedAt"
       FROM pos_webhook_events
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id=$3::text)
         AND ($4::text IS NULL OR status=$4)
       ORDER BY created_at DESC
       LIMIT $5`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      status ?? null,
      limit,
    );
  }

  async requestReplay(eventId: string) {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE pos_webhook_events
       SET status='RETRY_PENDING',next_retry_at=NOW(),dead_letter_at=NULL,error_message=NULL,
           replay_requested_at=NOW(),claimed_at=NULL,claim_token=NULL
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       RETURNING id`,
      eventId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!rows.length) throw new NotFoundException('POS webhook event not found.');
    return { eventId, queued: true };
  }

  async processDue(limit = 25) {
    const claimToken = randomUUID();
    const claimed = await this.prisma.$queryRawUnsafe<QueueRow[]>(
      `WITH candidates AS (
         SELECT id
         FROM pos_webhook_events
         WHERE status IN ('RETRY_PENDING','ENRICHMENT_PENDING')
           AND next_retry_at IS NOT NULL
           AND next_retry_at<=NOW()
         ORDER BY next_retry_at ASC,created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE pos_webhook_events e
       SET status='PROCESSING',claimed_at=NOW(),claim_token=$2,last_attempt_at=NOW()
       FROM candidates c
       WHERE e.id=c.id
       RETURNING e.id,e.retry_count AS "retryCount",e.status`,
      limit,
      claimToken,
    );

    const results: Array<{ eventId: string; ok: boolean; status: string }> = [];
    for (const row of claimed) {
      try {
        const result = await this.webhooks.replayStored(row.id);
        if (result.requiresEnrichment) {
          const status = await this.reschedule(row.id, row.retryCount, 'ENRICHMENT_PENDING');
          results.push({ eventId: row.id, ok: status !== 'DEAD_LETTER', status });
        } else {
          results.push({ eventId: row.id, ok: true, status: 'PROCESSED' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown webhook retry error';
        const status = await this.reschedule(row.id, row.retryCount, 'RETRY_PENDING', message);
        results.push({ eventId: row.id, ok: false, status });
      }
    }
    return results;
  }

  private async reschedule(
    eventId: string,
    previousRetryCount: number,
    pendingStatus: 'RETRY_PENDING' | 'ENRICHMENT_PENDING',
    errorMessage?: string,
  ) {
    const retryCount = previousRetryCount + 1;
    if (retryCount >= MAX_RETRY_COUNT) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE pos_webhook_events
         SET status='DEAD_LETTER',retry_count=$2,next_retry_at=NULL,dead_letter_at=NOW(),
             error_message=COALESCE($3,error_message),claimed_at=NULL,claim_token=NULL
         WHERE id=$1::text`,
        eventId,
        retryCount,
        errorMessage?.slice(0, 1000) ?? null,
      );
      return 'DEAD_LETTER';
    }

    const delayMinutes = Math.min(2 ** Math.max(0, retryCount - 1), MAX_BACKOFF_MINUTES);
    await this.prisma.$executeRawUnsafe(
      `UPDATE pos_webhook_events
       SET status=$2,retry_count=$3,next_retry_at=NOW()+($4::text||' minutes')::interval,
           error_message=COALESCE($5,error_message),claimed_at=NULL,claim_token=NULL
       WHERE id=$1::text`,
      eventId,
      pendingStatus,
      retryCount,
      delayMinutes,
      errorMessage?.slice(0, 1000) ?? null,
    );
    return pendingStatus;
  }
}
