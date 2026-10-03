import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const CORE_STEP_KEYS = [
  'TENANT',
  'SUBSCRIPTION',
  'ENTITLEMENTS',
  'COMPANY',
  'PRIMARY_BRANCH',
] as const;

type CoreStepKey = (typeof CORE_STEP_KEYS)[number];

type FailedStepRow = {
  id: string;
  stepKey: CoreStepKey;
  tenantId: string | null;
  correlationId: string | null;
};

@Injectable()
export class PlatformProvisioningFailureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async recordCoreFailure(
    runId: string,
    error: unknown,
    actorUserId: string,
    reason?: string | null,
    correlationId?: string | null,
  ) {
    const message = this.errorMessage(error);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('platform-provisioning'), hashtext(${runId}))
      `;

      const rows = await tx.$queryRaw<FailedStepRow[]>`
        SELECT
          s.id,
          s.step_key AS "stepKey",
          r.tenant_id AS "tenantId",
          r.correlation_id AS "correlationId"
        FROM platform_provisioning_steps s
        JOIN platform_provisioning_runs r ON r.id = s.run_id
        WHERE s.run_id = ${runId}
          AND s.position <= 5
          AND s.status <> 'COMPLETED'
        ORDER BY s.position ASC
        LIMIT 1
        FOR UPDATE OF s
      `;
      const step = rows[0];

      await tx.$executeRaw`
        UPDATE platform_provisioning_runs
        SET status = 'FAILED', last_error = ${message}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${runId} AND status <> 'COMPLETED'
      `;

      if (!step) return null;

      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET
          status = 'FAILED',
          attempt_count = attempt_count + 1,
          last_error = ${message},
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${step.id} AND status <> 'COMPLETED'
      `;

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: `step.${step.stepKey.toLowerCase()}.failed`,
          targetTenantId: step.tenantId,
          targetEntityType: 'platform_provisioning_run',
          targetEntityId: runId,
          reason: reason ?? null,
          afterState: {
            stepKey: step.stepKey,
            status: 'FAILED',
            error: message,
          },
          correlationId: correlationId ?? step.correlationId,
        },
        tx,
      );

      return { stepKey: step.stepKey, error: message };
    });
  }

  async recordCoreFailureByIdempotencyKey(
    idempotencyKey: string | undefined,
    error: unknown,
    actorUserId: string,
    reason?: string | null,
    correlationId?: string | null,
  ) {
    const normalized = idempotencyKey?.trim();
    if (!normalized) return null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM platform_provisioning_runs
      WHERE idempotency_key = ${normalized}
      LIMIT 1
    `;
    if (!rows[0]) return null;
    return this.recordCoreFailure(
      rows[0].id,
      error,
      actorUserId,
      reason,
      correlationId,
    );
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 4000);
    return 'Provisioning step failed.';
  }
}
