import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const PROVISIONING_STEPS = [
  'TENANT',
  'SUBSCRIPTION',
  'ENTITLEMENTS',
  'COMPANY',
  'PRIMARY_BRANCH',
  'OWNER_INVITATION',
  'DEFAULT_ROLES_PERMISSIONS',
  'DEFAULT_CONFIGURATION',
  'ONBOARDING_CHECKLIST',
  'GO_LIVE',
] as const;

const IMPLEMENTED_STEPS = PROVISIONING_STEPS.slice(0, 5);
type ProvisioningStepKey = (typeof PROVISIONING_STEPS)[number];
type ImplementedStepKey = (typeof IMPLEMENTED_STEPS)[number];

type ProvisioningInput = {
  idempotencyKey: string;
  tenantName: string;
  tenantSlug: string;
  planVersionId: string;
  companyName: string;
  companySlug: string;
  primaryBranchName: string;
  primaryBranchCode: string;
  sourceType: 'MANUAL' | 'OPPORTUNITY';
  sourceId: string | null;
};

type RunRow = {
  id: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED';
  sourceType: 'MANUAL' | 'OPPORTUNITY';
  sourceId: string | null;
  tenantId: string | null;
  planVersionId: string;
  input: ProvisioningInput;
  lastError: string | null;
  createdByUserId: string;
  correlationId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StepRow = {
  id: string;
  stepKey: ProvisioningStepKey;
  position: number;
  status: 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'SKIPPED';
  attemptCount: number;
  output: unknown;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async start(
    raw: Partial<ProvisioningInput>,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const input = this.normalizeInput(raw);
    const fingerprint = this.fingerprint(input);
    await this.assertActivePlanVersion(input.planVersionId);

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RunRow[]>`
        INSERT INTO platform_provisioning_runs (
          idempotency_key,
          request_fingerprint,
          status,
          source_type,
          source_id,
          plan_version_id,
          input,
          created_by_user_id,
          correlation_id,
          started_at,
          updated_at
        ) VALUES (
          ${input.idempotencyKey},
          ${fingerprint},
          'PENDING',
          ${input.sourceType},
          ${input.sourceId},
          ${input.planVersionId},
          ${JSON.stringify(input)}::jsonb,
          ${actorUserId},
          ${correlationId ?? null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING
          id,
          idempotency_key AS "idempotencyKey",
          request_fingerprint AS "requestFingerprint",
          status,
          source_type AS "sourceType",
          source_id AS "sourceId",
          tenant_id AS "tenantId",
          plan_version_id AS "planVersionId",
          input,
          last_error AS "lastError",
          created_by_user_id AS "createdByUserId",
          correlation_id AS "correlationId",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;

      const run = rows[0] ?? (await this.findRunByIdempotencyKey(input.idempotencyKey, tx));
      if (!run) throw new ConflictException('Provisioning run could not be created.');
      if (run.requestFingerprint !== fingerprint) {
        throw new ConflictException(
          'Provisioning idempotency key is already bound to a different request.',
        );
      }

      for (const [position, stepKey] of PROVISIONING_STEPS.entries()) {
        await tx.$executeRaw`
          INSERT INTO platform_provisioning_steps (run_id, step_key, position)
          VALUES (${run.id}, ${stepKey}, ${position + 1})
          ON CONFLICT (run_id, step_key) DO NOTHING
        `;
      }

      if (rows[0]) {
        await this.platformAudit.record(
          {
            actorUserId,
            resource: 'provisioning',
            action: 'run.create',
            targetEntityType: 'platform_provisioning_run',
            targetEntityId: run.id,
            reason,
            afterState: {
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              planVersionId: input.planVersionId,
              tenantSlug: input.tenantSlug,
            },
            correlationId: correlationId ?? null,
          },
          tx,
        );
      }

      return run;
    });

    if (created.status === 'COMPLETED') return this.get(created.id);
    return this.resume(created.id, actorUserId, reason, correlationId);
  }

  async resume(
    runId: string,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const existing = await this.findRun(runId);
    if (!existing) throw new NotFoundException('Provisioning run not found.');

    await this.prisma.$executeRaw`
      UPDATE platform_provisioning_runs
      SET status = 'RUNNING', last_error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${runId} AND status <> 'COMPLETED'
    `;

    for (const stepKey of IMPLEMENTED_STEPS) {
      try {
        await this.executeStep(runId, stepKey, actorUserId, reason, correlationId);
      } catch (error) {
        const message = this.errorMessage(error);
        await this.prisma.$executeRaw`
          UPDATE platform_provisioning_runs
          SET status = 'FAILED', last_error = ${message}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${runId}
        `;
        throw error;
      }
    }

    return this.get(runId);
  }

  async get(runId: string) {
    const run = await this.findRun(runId);
    if (!run) throw new NotFoundException('Provisioning run not found.');

    const steps = await this.prisma.$queryRaw<StepRow[]>`
      SELECT
        id,
        step_key AS "stepKey",
        position,
        status,
        attempt_count AS "attemptCount",
        output,
        last_error AS "lastError",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM platform_provisioning_steps
      WHERE run_id = ${runId}
      ORDER BY position ASC
    `;

    return {
      ...run,
      steps,
      resumable: run.status !== 'COMPLETED',
      foundationComplete: IMPLEMENTED_STEPS.every(
        (key) => steps.find((step) => step.stepKey === key)?.status === 'COMPLETED',
      ),
    };
  }

  private async executeStep(
    runId: string,
    stepKey: ImplementedStepKey,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('platform-provisioning'),
          hashtext(${runId})
        )
      `;

      const run = await this.findRun(runId, tx);
      if (!run) throw new NotFoundException('Provisioning run not found.');

      const stepRows = await tx.$queryRaw<StepRow[]>`
        SELECT
          id,
          step_key AS "stepKey",
          position,
          status,
          attempt_count AS "attemptCount",
          output,
          last_error AS "lastError",
          started_at AS "startedAt",
          completed_at AS "completedAt"
        FROM platform_provisioning_steps
        WHERE run_id = ${runId} AND step_key = ${stepKey}
        FOR UPDATE
      `;
      const step = stepRows[0];
      if (!step) throw new NotFoundException(`Provisioning step ${stepKey} not found.`);
      if (step.status === 'COMPLETED') return step.output;

      await tx.$executeRaw`
        UPDATE platform_provisioning_steps
        SET status = 'RUNNING',
            attempt_count = attempt_count + 1,
            last_error = NULL,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${step.id}
      `;

      try {
        const output = await this.runStep(tx, run, stepKey);
        await tx.$executeRaw`
          UPDATE platform_provisioning_steps
          SET status = 'COMPLETED',
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
            targetTenantId:
              stepKey === 'TENANT'
                ? (output as { tenantId?: string }).tenantId ?? run.tenantId
                : run.tenantId,
            targetEntityType: 'platform_provisioning_run',
            targetEntityId: runId,
            reason,
            afterState: output,
            metadata: { stepKey },
            correlationId: correlationId ?? run.correlationId,
          },
          tx,
        );

        return output;
      } catch (error) {
        const message = this.errorMessage(error);
        await tx.$executeRaw`
          UPDATE platform_provisioning_steps
          SET status = 'FAILED', last_error = ${message}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${step.id}
        `;
        throw error;
      }
    });
  }

  private async runStep(
    tx: Prisma.TransactionClient,
    run: RunRow,
    stepKey: ImplementedStepKey,
  ): Promise<Record<string, unknown>> {
    const input = run.input;

    if (stepKey === 'TENANT') {
      if (run.tenantId) return { tenantId: run.tenantId };
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName, slug: input.tenantSlug },
        select: { id: true, name: true, slug: true },
      });
      await tx.$executeRaw`
        UPDATE platform_provisioning_runs
        SET tenant_id = ${tenant.id}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${run.id}
      `;
      return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug };
    }

    const tenantId = run.tenantId ?? (await this.resolveRunTenantId(run.id, tx));
    if (!tenantId) throw new ConflictException('Tenant step must complete first.');

    if (stepKey === 'SUBSCRIPTION') {
      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM platform_tenant_subscriptions
        WHERE tenant_id = ${tenantId}
          AND status IN ('TRIAL','ACTIVE','PAST_DUE')
        LIMIT 1
      `;
      if (existing[0]) return { subscriptionId: existing[0].id };

      const rows = await tx.$queryRaw<Array<{
        id: string;
        currency: string;
        monthlyPrice: Prisma.Decimal | null;
        annualPrice: Prisma.Decimal | null;
      }>>`
        SELECT
          id,
          currency,
          monthly_price AS "monthlyPrice",
          annual_price AS "annualPrice"
        FROM platform_plan_versions
        WHERE id = ${run.planVersionId} AND status = 'ACTIVE'
        LIMIT 1
      `;
      const plan = rows[0];
      if (!plan) throw new BadRequestException('Active plan version not found.');

      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO platform_tenant_subscriptions (
          tenant_id,
          plan_version_id,
          status,
          currency,
          contracted_monthly_price,
          contracted_annual_price,
          created_by_user_id,
          updated_by_user_id
        ) VALUES (
          ${tenantId},
          ${run.planVersionId},
          'ACTIVE',
          ${plan.currency},
          ${plan.monthlyPrice},
          ${plan.annualPrice},
          ${run.createdByUserId},
          ${run.createdByUserId}
        )
        RETURNING id
      `;
      return { subscriptionId: inserted[0].id };
    }

    if (stepKey === 'ENTITLEMENTS') {
      const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM platform_plan_entitlements
        WHERE plan_version_id = ${run.planVersionId}
      `;
      return {
        resolver: 'PLAN_ENTITLEMENTS',
        planEntitlementCount: Number(rows[0]?.count ?? 0n),
      };
    }

    if (stepKey === 'COMPANY') {
      const existing = await tx.company.findFirst({
        where: { tenantId, slug: input.companySlug },
        select: { id: true, name: true, slug: true },
      });
      const company =
        existing ??
        (await tx.company.create({
          data: {
            tenantId,
            name: input.companyName,
            slug: input.companySlug,
            status: 'ACTIVE',
          },
          select: { id: true, name: true, slug: true },
        }));
      return { companyId: company.id, name: company.name, slug: company.slug };
    }

    const company = await tx.company.findFirst({
      where: { tenantId, slug: input.companySlug },
      select: { id: true },
    });
    if (!company) throw new ConflictException('Company step must complete first.');

    const existingBranch = await tx.branch.findFirst({
      where: { companyId: company.id, code: input.primaryBranchCode },
      select: { id: true, name: true, code: true },
    });
    const branch =
      existingBranch ??
      (await tx.branch.create({
        data: {
          companyId: company.id,
          name: input.primaryBranchName,
          code: input.primaryBranchCode,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, code: true },
      }));
    return { branchId: branch.id, name: branch.name, code: branch.code };
  }

  private normalizeInput(raw: Partial<ProvisioningInput>): ProvisioningInput {
    const required = (value: string | undefined, field: string) => {
      const normalized = value?.trim();
      if (!normalized) throw new BadRequestException(`${field} is required.`);
      return normalized;
    };
    const slug = (value: string | undefined, field: string) => {
      const normalized = required(value, field).toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
        throw new BadRequestException(`${field} must be a lowercase URL-safe slug.`);
      }
      return normalized;
    };
    const sourceType = (raw.sourceType ?? 'MANUAL').toUpperCase();
    if (sourceType !== 'MANUAL' && sourceType !== 'OPPORTUNITY') {
      throw new BadRequestException('sourceType must be MANUAL or OPPORTUNITY.');
    }
    const sourceId = raw.sourceId?.trim() || null;
    if (sourceType === 'OPPORTUNITY' && !sourceId) {
      throw new BadRequestException('sourceId is required for OPPORTUNITY provisioning.');
    }

    return {
      idempotencyKey: required(raw.idempotencyKey, 'idempotencyKey'),
      tenantName: required(raw.tenantName, 'tenantName'),
      tenantSlug: slug(raw.tenantSlug, 'tenantSlug'),
      planVersionId: required(raw.planVersionId, 'planVersionId'),
      companyName: required(raw.companyName, 'companyName'),
      companySlug: slug(raw.companySlug, 'companySlug'),
      primaryBranchName: required(raw.primaryBranchName, 'primaryBranchName'),
      primaryBranchCode: required(raw.primaryBranchCode, 'primaryBranchCode').toUpperCase(),
      sourceType,
      sourceId,
    };
  }

  private fingerprint(input: ProvisioningInput) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private async assertActivePlanVersion(planVersionId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform_plan_versions
      WHERE id = ${planVersionId} AND status = 'ACTIVE'
      LIMIT 1
    `;
    if (!rows[0]) throw new BadRequestException('Active plan version not found.');
  }

  private async resolveRunTenantId(runId: string, tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ tenantId: string | null }>>`
      SELECT tenant_id AS "tenantId"
      FROM platform_provisioning_runs
      WHERE id = ${runId}
      LIMIT 1
    `;
    return rows[0]?.tenantId ?? null;
  }

  private async findRun(
    id: string,
    db: Pick<Prisma.TransactionClient, '$queryRaw'> = this.prisma,
  ) {
    const rows = await db.$queryRaw<RunRow[]>`
      SELECT
        id,
        idempotency_key AS "idempotencyKey",
        request_fingerprint AS "requestFingerprint",
        status,
        source_type AS "sourceType",
        source_id AS "sourceId",
        tenant_id AS "tenantId",
        plan_version_id AS "planVersionId",
        input,
        last_error AS "lastError",
        created_by_user_id AS "createdByUserId",
        correlation_id AS "correlationId",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_provisioning_runs
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async findRunByIdempotencyKey(
    idempotencyKey: string,
    db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ) {
    const rows = await db.$queryRaw<RunRow[]>`
      SELECT
        id,
        idempotency_key AS "idempotencyKey",
        request_fingerprint AS "requestFingerprint",
        status,
        source_type AS "sourceType",
        source_id AS "sourceId",
        tenant_id AS "tenantId",
        plan_version_id AS "planVersionId",
        input,
        last_error AS "lastError",
        created_by_user_id AS "createdByUserId",
        correlation_id AS "correlationId",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_provisioning_runs
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 1000);
    return 'Unknown provisioning error';
  }
}
