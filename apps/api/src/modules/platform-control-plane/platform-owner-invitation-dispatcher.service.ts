import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import {
  PlatformInvitationProviderError,
  PlatformOwnerInvitationWebhookProvider,
} from './platform-owner-invitation-webhook.provider';

type DeliveryStatus = 'PENDING' | 'CLAIMED' | 'RETRY' | 'SENT' | 'DEAD' | 'CANCELLED';

type DeliveryClaim = {
  id: string;
  provisioningRunId: string;
  tenantId: string;
  companyId: string;
  roleId: string;
  email: string;
  branchIds: unknown;
  status: DeliveryStatus;
  invitationId: string | null;
  attemptCount: number;
  leaseUntil: Date | null;
  createdByPlatformUserId: string;
  correlationId: string | null;
  alreadySent?: boolean;
};

@Injectable()
export class PlatformOwnerInvitationDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provider: PlatformOwnerInvitationWebhookProvider,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async dispatch(
    runId: string,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const claim = await this.claim(runId);
    if (claim.alreadySent) {
      return {
        deliveryId: claim.id,
        provisioningRunId: claim.provisioningRunId,
        status: 'SENT' as const,
        invitationId: claim.invitationId,
        alreadySent: true,
      };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invitationId = randomUUID();
    const ttlHours =
      this.config.get<number>('PLATFORM_INVITATION_TOKEN_TTL_HOURS') ?? 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
      await this.prepareInvitation(claim, invitationId, tokenHash, expiresAt);

      const publicApiUrl = this.config
        .get<string>('PUBLIC_API_URL')
        ?.replace(/\/$/, '');
      const result = await this.provider.send({
        deliveryId: claim.id,
        provisioningRunId: claim.provisioningRunId,
        tenantId: claim.tenantId,
        companyId: claim.companyId,
        email: claim.email,
        invitationToken: rawToken,
        expiresAt: expiresAt.toISOString(),
        acceptApiUrl: publicApiUrl
          ? `${publicApiUrl}/auth/invitations/accept`
          : null,
      });

      await this.markSent(
        claim,
        invitationId,
        result.providerMessageId,
        actorUserId,
        reason,
        correlationId,
      );

      return {
        deliveryId: claim.id,
        provisioningRunId: claim.provisioningRunId,
        invitationId,
        email: claim.email,
        expiresAt,
        status: 'SENT' as const,
        provider: this.provider.key,
        providerMessageId: result.providerMessageId,
      };
    } catch (error) {
      const providerError =
        error instanceof PlatformInvitationProviderError
          ? error
          : new PlatformInvitationProviderError('INVITATION_DELIVERY_FAILED', true);
      await this.markFailed(
        claim,
        invitationId,
        providerError,
        actorUserId,
        reason,
        correlationId,
      );
      if (providerError.retryable) {
        throw new ServiceUnavailableException({
          code: providerError.code,
          message: 'Owner invitation delivery failed and is scheduled for retry.',
        });
      }
      throw new BadGatewayException({
        code: providerError.code,
        message: 'Owner invitation delivery failed.',
      });
    }
  }

  private async claim(runId: string): Promise<DeliveryClaim> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('platform-owner-invitation-delivery'),
          hashtext(${runId})
        )
      `;

      const rows = await tx.$queryRaw<DeliveryClaim[]>`
        SELECT
          id,
          provisioning_run_id AS "provisioningRunId",
          tenant_id AS "tenantId",
          company_id AS "companyId",
          role_id AS "roleId",
          email,
          branch_ids AS "branchIds",
          status,
          invitation_id AS "invitationId",
          attempt_count AS "attemptCount",
          lease_until AS "leaseUntil",
          created_by_platform_user_id AS "createdByPlatformUserId",
          correlation_id AS "correlationId"
        FROM platform_owner_invitation_deliveries
        WHERE provisioning_run_id = ${runId}
        FOR UPDATE
      `;
      const delivery = rows[0];
      if (!delivery) {
        throw new NotFoundException('Owner invitation delivery request not found.');
      }
      if (delivery.status === 'SENT') {
        return { ...delivery, alreadySent: true };
      }
      if (delivery.status === 'DEAD' || delivery.status === 'CANCELLED') {
        throw new ConflictException(
          `Owner invitation delivery is ${delivery.status.toLowerCase()}.`,
        );
      }
      if (
        delivery.status === 'CLAIMED' &&
        delivery.leaseUntil &&
        delivery.leaseUntil.getTime() > Date.now()
      ) {
        throw new ConflictException('Owner invitation delivery is already being processed.');
      }
      if (delivery.attemptCount >= 10) {
        await tx.$executeRaw`
          UPDATE platform_owner_invitation_deliveries
          SET status = 'DEAD', last_error = 'MAX_ATTEMPTS_EXCEEDED',
              lease_until = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${delivery.id}
        `;
        throw new ConflictException('Owner invitation delivery exhausted its retry budget.');
      }

      await tx.$executeRaw`
        UPDATE platform_owner_invitation_deliveries
        SET status = 'CLAIMED',
            attempt_count = attempt_count + 1,
            lease_until = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${delivery.id}
      `;

      return {
        ...delivery,
        status: 'CLAIMED',
        attemptCount: delivery.attemptCount + 1,
        leaseUntil: new Date(Date.now() + 5 * 60 * 1000),
      };
    });
  }

  private async prepareInvitation(
    claim: DeliveryClaim,
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const branchIds = this.normalizeBranchIds(claim.branchIds);
    const branchIdsJson = JSON.stringify(branchIds);

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: DeliveryStatus }>>`
        SELECT status
        FROM platform_owner_invitation_deliveries
        WHERE id = ${claim.id}
        FOR UPDATE
      `;
      if (rows[0]?.status !== 'CLAIMED') {
        throw new ConflictException('Owner invitation delivery claim is no longer valid.');
      }

      await tx.$executeRaw`
        UPDATE user_invitations
        SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = ${claim.tenantId}
          AND "companyId" = ${claim.companyId}
          AND email = ${claim.email}
          AND "acceptedAt" IS NULL
          AND "revokedAt" IS NULL
      `;

      await tx.$executeRaw`
        INSERT INTO user_invitations (
          id,
          "tenantId",
          "companyId",
          email,
          "roleId",
          "branchIds",
          "tokenHash",
          "invitedByUserId",
          "expiresAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${invitationId},
          ${claim.tenantId},
          ${claim.companyId},
          ${claim.email},
          ${claim.roleId},
          ${branchIdsJson}::jsonb,
          ${tokenHash},
          ${claim.createdByPlatformUserId},
          ${expiresAt},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `;

      await tx.$executeRaw`
        UPDATE platform_owner_invitation_deliveries
        SET invitation_id = ${invitationId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${claim.id}
      `;
    });
  }

  private async markSent(
    claim: DeliveryClaim,
    invitationId: string,
    providerMessageId: string | null,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('platform-owner-invitation-delivery'),
          hashtext(${claim.provisioningRunId})
        )
      `;

      await tx.$executeRaw`
        UPDATE platform_owner_invitation_deliveries
        SET status = 'SENT',
            invitation_id = ${invitationId},
            delivery_provider = ${this.provider.key},
            provider_message_id = ${providerMessageId},
            lease_until = NULL,
            last_error = NULL,
            sent_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${claim.id} AND status = 'CLAIMED'
      `;

      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET status = 'COMPLETED',
            attempt_count = GREATEST(attempt_count, ${claim.attemptCount}),
            output = ${JSON.stringify({
              deliveryRequestId: claim.id,
              invitationId,
              deliveryStatus: 'SENT',
              provider: this.provider.key,
              providerMessageId,
            })}::jsonb,
            completed_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ${claim.provisioningRunId}
          AND step_key = 'OWNER_INVITATION'
      `;

      await tx.$executeRaw`
        UPDATE platform_provisioning_runs r
        SET status = 'RUNNING', last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE r.id = ${claim.provisioningRunId}
          AND r.status <> 'COMPLETED'
          AND NOT EXISTS (
            SELECT 1
            FROM platform_provisioning_steps s
            WHERE s.run_id = r.id
              AND s.status = 'FAILED'
              AND s.step_key <> 'OWNER_INVITATION'
          )
      `;

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: 'owner_invitation.sent',
          targetTenantId: claim.tenantId,
          targetEntityType: 'user_invitation',
          targetEntityId: invitationId,
          reason,
          afterState: {
            deliveryId: claim.id,
            email: claim.email,
            expiresAt: null,
            provider: this.provider.key,
            providerMessageId,
          },
          metadata: {
            provisioningRunId: claim.provisioningRunId,
            companyId: claim.companyId,
            roleId: claim.roleId,
            attempt: claim.attemptCount,
          },
          correlationId: correlationId ?? claim.correlationId,
        },
        tx,
      );
    });
  }

  private async markFailed(
    claim: DeliveryClaim,
    invitationId: string,
    error: PlatformInvitationProviderError,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const terminal = !error.retryable || claim.attemptCount >= 10;
    const status: DeliveryStatus = terminal ? 'DEAD' : 'RETRY';
    const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, claim.attemptCount - 1));

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('platform-owner-invitation-delivery'),
          hashtext(${claim.provisioningRunId})
        )
      `;

      await tx.$executeRaw`
        UPDATE user_invitations
        SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${invitationId} AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
      `;

      await tx.$executeRaw`
        UPDATE platform_owner_invitation_deliveries
        SET status = ${status},
            lease_until = NULL,
            last_error = ${error.code},
            next_attempt_at = CURRENT_TIMESTAMP + (${delaySeconds} * INTERVAL '1 second'),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${claim.id}
      `;

      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET status = 'FAILED',
            attempt_count = GREATEST(attempt_count, ${claim.attemptCount}),
            output = ${JSON.stringify({
              deliveryRequestId: claim.id,
              deliveryStatus: status,
              errorCode: error.code,
            })}::jsonb,
            last_error = ${error.code},
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ${claim.provisioningRunId}
          AND step_key = 'OWNER_INVITATION'
          AND status <> 'COMPLETED'
      `;

      await tx.$executeRaw`
        UPDATE platform_provisioning_runs
        SET status = 'FAILED', last_error = ${error.code}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${claim.provisioningRunId} AND status <> 'COMPLETED'
      `;

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: terminal ? 'owner_invitation.dead' : 'owner_invitation.retry',
          targetTenantId: claim.tenantId,
          targetEntityType: 'platform_owner_invitation_delivery',
          targetEntityId: claim.id,
          reason,
          afterState: {
            status,
            errorCode: error.code,
            attempt: claim.attemptCount,
            retryInSeconds: terminal ? null : delaySeconds,
          },
          metadata: {
            provisioningRunId: claim.provisioningRunId,
            companyId: claim.companyId,
          },
          correlationId: correlationId ?? claim.correlationId,
        },
        tx,
      );
    });
  }

  private normalizeBranchIds(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
