import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { createHash } from 'crypto';
import { TenantContext } from '../../common/tenant/tenant-context';
import { QualityNotificationOutboxService } from './quality-notification-outbox.service';
import {
  QualityNotificationProviderError,
} from './quality-notification-provider';
import { QualityNotificationWebhookProvider } from './quality-notification-webhook.provider';
import { QualityPublicFeedbackService } from './quality-public-feedback.service';

@Injectable()
export class QualityNotificationDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly outbox: QualityNotificationOutboxService,
    private readonly provider: QualityNotificationWebhookProvider,
    private readonly publicFeedback: QualityPublicFeedbackService,
  ) {}

  async dispatchFeedbackBatch(actorUserId: string, requestedLimit?: number) {
    const limit = this.normalizeLimit(requestedLimit);
    const claim = await this.outbox.claim(actorUserId, limit, 120);
    const { tenantId, companyId } = this.tenantContext.getContext();

    let sent = 0;
    let retry = 0;
    let dead = 0;

    for (const delivery of claim.deliveries) {
      try {
        const recipient = await this.resolveEmailRecipient(
          tenantId,
          companyId,
          delivery.customerId,
          delivery.branchId,
        );

        if (!recipient) {
          await this.outbox.markPermanentFailure(
            delivery.id,
            claim.claimToken,
            actorUserId,
            'RECIPIENT_EMAIL_MISSING',
            'EMAIL',
            this.provider.key,
            null,
          );
          dead += 1;
          continue;
        }

        if (!this.provider.supports('EMAIL')) {
          await this.outbox.markPermanentFailure(
            delivery.id,
            claim.claimToken,
            actorUserId,
            'CHANNEL_UNSUPPORTED',
            'EMAIL',
            this.provider.key,
            this.hashRecipient(recipient),
          );
          dead += 1;
          continue;
        }

        const publicAccess = await this.publicFeedback.issueToken(
          delivery.feedbackRequestId,
        );

        const result = await this.provider.send({
          outboxId: delivery.id,
          feedbackRequestId: delivery.feedbackRequestId,
          channel: 'EMAIL',
          recipient,
          templateKey: 'quality.feedback-request',
          data: {
            tenantId,
            companyId,
            branchId: delivery.branchId,
            customerId: delivery.customerId,
            feedbackToken: publicAccess.token,
            feedbackExpiresAt: new Date(publicAccess.expiresAt).toISOString(),
          },
        });

        await this.outbox.markSent(
          delivery.id,
          claim.claimToken,
          actorUserId,
          result.providerMessageId ?? null,
          'EMAIL',
          this.provider.key,
          this.hashRecipient(recipient),
        );
        sent += 1;
      } catch (error) {
        const providerError = this.normalizeProviderError(error);
        if (providerError.retryable) {
          await this.outbox.markFailed(
            delivery.id,
            claim.claimToken,
            actorUserId,
            providerError.code,
            'EMAIL',
            this.provider.key,
          );
          retry += 1;
        } else {
          await this.outbox.markPermanentFailure(
            delivery.id,
            claim.claimToken,
            actorUserId,
            providerError.code,
            'EMAIL',
            this.provider.key,
            null,
          );
          dead += 1;
        }
      }
    }

    return {
      claimed: claim.claimed,
      sent,
      retry,
      dead,
    };
  }

  private async resolveEmailRecipient(
    tenantId: string,
    companyId: string,
    customerId: string,
    branchId: string,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
      `SELECT c.email
       FROM customers c
       JOIN branches b ON b.id=c."branchId"
       WHERE c.id=$1::text
         AND c."tenantId"=$2::text
         AND c."branchId"=$3::text
         AND b."companyId"=$4::text
         AND b.status='ACTIVE'
       LIMIT 1`,
      customerId,
      tenantId,
      branchId,
      companyId,
    );

    const email = rows[0]?.email?.trim().toLowerCase() ?? '';
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return null;
    }
    return email;
  }

  private hashRecipient(recipient: string): string {
    return createHash('sha256').update(recipient).digest('hex');
  }

  private normalizeProviderError(error: unknown): QualityNotificationProviderError {
    if (error instanceof QualityNotificationProviderError) return error;
    return new QualityNotificationProviderError('PROVIDER_UNKNOWN_ERROR', true);
  }

  private normalizeLimit(value?: number): number {
    if (value === undefined) return 25;
    if (!Number.isInteger(value) || value < 1) return 25;
    return Math.min(value, 100);
  }
}
