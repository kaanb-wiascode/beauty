import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PlatformTenantBootstrapService } from './platform-tenant-bootstrap.service';

type ProvisioningStartInput = {
  idempotencyKey?: string;
  tenantName?: string;
  tenantSlug?: string;
  planVersionId?: string;
  companyName?: string;
  companySlug?: string;
  primaryBranchName?: string;
  primaryBranchCode?: string;
  sourceType?: 'MANUAL' | 'OPPORTUNITY';
  sourceId?: string;
};

type ProvisioningSnapshot = {
  id: string;
  tenantId: string | null;
  input: {
    companySlug: string;
  };
};

@Injectable()
export class PlatformProvisioningCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: PlatformProvisioningService,
    private readonly tenantBootstrap: PlatformTenantBootstrapService,
    private readonly onboarding: PlatformOnboardingService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async start(
    input: ProvisioningStartInput,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const result = await this.provisioning.start(
      input,
      actorUserId,
      reason,
      correlationId,
    );
    return this.advance(result as ProvisioningSnapshot, actorUserId, reason, correlationId);
  }

  get(runId: string) {
    return this.provisioning.get(runId);
  }

  async resume(
    runId: string,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const result = await this.provisioning.resume(
      runId,
      actorUserId,
      reason,
      correlationId,
    );
    return this.advance(result as ProvisioningSnapshot, actorUserId, reason, correlationId);
  }

  private async advance(
    snapshot: ProvisioningSnapshot,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const run = snapshot.id ? snapshot : await this.provisioning.get(snapshot.id) as ProvisioningSnapshot;
    if (!run.tenantId) return this.provisioning.get(run.id);

    await this.completeStep(
      run.id,
      'DEFAULT_ROLES_PERMISSIONS',
      actorUserId,
      reason,
      correlationId,
      async (tx) => this.tenantBootstrap.ensureDefaultRbac(
        run.tenantId as string,
        actorUserId,
        {
          companySlug: run.input.companySlug,
          reason,
          correlationId,
        },
        tx,
      ),
    );

    await this.completeStep(
      run.id,
      'ONBOARDING_CHECKLIST',
      actorUserId,
      reason,
      correlationId,
      async (tx) => {
        const onboarding = await this.onboarding.ensureChecklist(
          run.tenantId as string,
          actorUserId,
          {
            provisioningRunId: run.id,
            reason,
            correlationId,
          },
          tx,
        );
        return {
          onboardingId: onboarding.id,
          itemCount: onboarding.summary.itemCount,
          requiredCount: onboarding.summary.requiredCount,
        };
      },
    );

    return this.provisioning.get(run.id);
  }

  private async completeStep(
    runId: string,
    stepKey: 'DEFAULT_ROLES_PERMISSIONS' | 'ONBOARDING_CHECKLIST',
    actorUserId: string,
    reason: string,
    correlationId: string | null | undefined,
    execute: (tx: Prisma.TransactionClient) => Promise<Record<string, unknown>>,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtext('platform-provisioning'),
            hashtext(${runId})
          )
        `;

        const rows = await tx.$queryRaw<Array<{
          id: string;
          status: string;
          tenantId: string | null;
        }>>`
          SELECT
            s.id,
            s.status,
            r.tenant_id AS "tenantId"
          FROM platform_provisioning_steps s
          JOIN platform_provisioning_runs r ON r.id = s.run_id
          WHERE s.run_id = ${runId} AND s.step_key = ${stepKey}
          FOR UPDATE OF s
        `;
        const step = rows[0];
        if (!step) throw new NotFoundException(`Provisioning step ${stepKey} not found.`);
        if (step.status === 'COMPLETED') return null;

        await tx.$executeRaw`
          UPDATE platform_provisioning_steps
          SET
            status = 'RUNNING',
            attempt_count = attempt_count + 1,
            last_error = NULL,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${step.id}
        `;

        const output = await execute(tx);
        await tx.$executeRaw`
          UPDATE platform_provisioning_steps
          SET
            status = 'COMPLETED',
            output = ${JSON.stringify(output)}::jsonb,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${step.id}
        `;

        await this.platformAudit.record(
          {
            actorUserId,
            resource: 'provisioning',
            action: `step.${stepKey.toLowerCase()}.complete`,
            targetTenantId: step.tenantId,
            targetEntityType: 'platform_provisioning_run',
            targetEntityId: runId,
            reason,
            afterState: output,
            metadata: { stepKey },
            correlationId: correlationId ?? null,
          },
          tx,
        );

        return output;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provisioning extension step failed.';
      await this.prisma.$executeRaw`
        UPDATE platform_provisioning_steps
        SET status = 'FAILED', last_error = ${message}, updated_at = CURRENT_TIMESTAMP
        WHERE run_id = ${runId} AND step_key = ${stepKey}
      `;
      await this.prisma.$executeRaw`
        UPDATE platform_provisioning_runs
        SET status = 'FAILED', last_error = ${message}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${runId}
      `;
      throw error;
    }
  }
}
