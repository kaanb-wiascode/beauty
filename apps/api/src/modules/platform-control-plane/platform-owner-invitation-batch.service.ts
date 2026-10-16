import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformOwnerInvitationDispatcherService } from './platform-owner-invitation-dispatcher.service';

type DueDeliveryRow = {
  provisioningRunId: string;
  createdByPlatformUserId: string;
};

@Injectable()
export class PlatformOwnerInvitationBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: PlatformOwnerInvitationDispatcherService,
  ) {}

  async dispatchDue(
    actorUserId: string | null,
    reason: string,
    limit = 10,
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Invitation batch dispatch requires a reason.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('limit must be an integer between 1 and 50.');
    }

    const rows = await this.prisma.$queryRaw<DueDeliveryRow[]>`
      SELECT
        provisioning_run_id AS "provisioningRunId",
        created_by_platform_user_id AS "createdByPlatformUserId"
      FROM platform_owner_invitation_deliveries
      WHERE status IN ('PENDING','RETRY')
        AND next_attempt_at <= CURRENT_TIMESTAMP
        AND attempt_count < 10
      ORDER BY next_attempt_at ASC, created_at ASC, id ASC
      LIMIT ${limit}
    `;

    const results: Array<{
      provisioningRunId: string;
      status: 'SENT' | 'FAILED';
      error?: string;
    }> = [];

    for (const row of rows) {
      try {
        await this.dispatcher.dispatch(
          row.provisioningRunId,
          actorUserId?.trim() || row.createdByPlatformUserId,
          normalizedReason,
          correlationId,
        );
        results.push({ provisioningRunId: row.provisioningRunId, status: 'SENT' });
      } catch (error) {
        results.push({
          provisioningRunId: row.provisioningRunId,
          status: 'FAILED',
          error: this.errorCode(error),
        });
      }
    }

    return {
      scanned: rows.length,
      sent: results.filter((result) => result.status === 'SENT').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      results,
    };
  }

  private errorCode(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'getResponse' in error &&
      typeof (error as { getResponse?: unknown }).getResponse === 'function'
    ) {
      const response = (error as { getResponse: () => unknown }).getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        const code = (response as { code?: unknown }).code;
        if (typeof code === 'string') return code.slice(0, 120);
      }
    }
    if (error instanceof Error) return error.name.slice(0, 120);
    return 'INVITATION_DISPATCH_FAILED';
  }
}
