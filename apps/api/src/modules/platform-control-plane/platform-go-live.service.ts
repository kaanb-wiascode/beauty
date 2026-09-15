import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const REQUIRED_PROVISIONING_STEPS = [
  'TENANT',
  'SUBSCRIPTION',
  'ENTITLEMENTS',
  'COMPANY',
  'PRIMARY_BRANCH',
  'OWNER_INVITATION',
  'DEFAULT_ROLES_PERMISSIONS',
  'DEFAULT_CONFIGURATION',
  'ONBOARDING_CHECKLIST',
] as const;

@Injectable()
export class PlatformGoLiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async execute(
    runId: string,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new ConflictException('Go-live requires a reason.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('platform-provisioning'), hashtext(${runId}))
      `;

      const runs = await tx.$queryRaw<
        Array<{ id: string; tenantId: string | null; status: string }>
      >`
        SELECT id, tenant_id AS "tenantId", status
        FROM platform_provisioning_runs
        WHERE id = ${runId}
        FOR UPDATE
      `;
      const run = runs[0];
      if (!run) throw new NotFoundException('Provisioning run not found.');
      if (!run.tenantId) throw new ConflictException('Tenant provisioning is incomplete.');

      const steps = await tx.$queryRaw<Array<{ stepKey: string; status: string }>>`
        SELECT step_key AS "stepKey", status
        FROM platform_provisioning_steps
        WHERE run_id = ${runId}
        FOR UPDATE
      `;
      const statusByKey = new Map(steps.map((step) => [step.stepKey, step.status]));
      const incomplete = REQUIRED_PROVISIONING_STEPS.filter(
        (stepKey) => statusByKey.get(stepKey) !== 'COMPLETED',
      );
      if (incomplete.length) {
        throw new ConflictException({
          code: 'PROVISIONING_NOT_READY_FOR_GO_LIVE',
          message: 'Provisioning prerequisites are incomplete.',
          incompleteSteps: incomplete,
        });
      }

      const onboardingRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM platform_tenant_onboarding
        WHERE tenant_id = ${run.tenantId}
        FOR UPDATE
      `;
      const onboarding = onboardingRows[0];
      if (!onboarding) throw new ConflictException('Tenant onboarding is missing.');

      const readinessRows = await tx.$queryRaw<
        Array<{ remaining: bigint; blocked: bigint }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE required = TRUE AND status <> 'COMPLETED')::bigint AS remaining,
          COUNT(*) FILTER (WHERE status = 'BLOCKED')::bigint AS blocked
        FROM platform_tenant_onboarding_items
        WHERE onboarding_id = ${onboarding.id}
      `;
      const readiness = readinessRows[0];
      const remaining = Number(readiness?.remaining ?? 0n);
      const blocked = Number(readiness?.blocked ?? 0n);
      if (remaining > 0 || blocked > 0) {
        throw new ConflictException({
          code: 'ONBOARDING_NOT_READY_FOR_GO_LIVE',
          message: 'Required onboarding items must be completed before go-live.',
          remainingRequiredItems: remaining,
          blockedItems: blocked,
        });
      }

      const lifecycleRows = await tx.$queryRaw<Array<{ state: string }>>`
        SELECT state
        FROM platform_tenant_lifecycle
        WHERE tenant_id = ${run.tenantId}
        FOR UPDATE
      `;
      if (lifecycleRows[0]?.state !== 'ACTIVE') {
        throw new ConflictException('Only ACTIVE tenants can go live.');
      }

      const activatedAt = new Date().toISOString();
      await tx.$executeRaw`
        UPDATE platform_tenant_onboarding
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${onboarding.id}
      `;
      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET status = 'COMPLETED',
            attempt_count = attempt_count + 1,
            output = ${JSON.stringify({ activatedAt })}::jsonb,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            completed_at = CURRENT_TIMESTAMP,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ${runId} AND step_key = 'GO_LIVE'
      `;
      await tx.$executeRaw`
        UPDATE platform_provisioning_runs
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
            last_error = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${runId}
      `;

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'provisioning',
          action: 'go_live.complete',
          targetTenantId: run.tenantId,
          targetEntityType: 'platform_provisioning_run',
          targetEntityId: runId,
          reason: normalizedReason,
          afterState: {
            status: 'COMPLETED',
            onboardingStatus: 'COMPLETED',
            activatedAt,
          },
          correlationId: correlationId ?? null,
        },
        tx,
      );

      return {
        runId,
        tenantId: run.tenantId,
        status: 'COMPLETED' as const,
        onboardingStatus: 'COMPLETED' as const,
        activatedAt,
      };
    });
  }
}
