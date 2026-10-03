import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

type RunStatus = 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED';
type SourceType = 'MANUAL' | 'OPPORTUNITY';

export type ProvisioningRunListInput = {
  status?: string;
  sourceType?: string;
  tenantId?: string;
  limit?: number;
};

type ProvisioningRunListRow = {
  id: string;
  idempotencyKey: string;
  status: RunStatus;
  sourceType: SourceType;
  sourceId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  planVersionId: string;
  ownerEmail: string | null;
  lastError: string | null;
  currentStep: string | null;
  totalSteps: bigint;
  completedSteps: bigint;
  failedSteps: bigint;
  runningSteps: bigint;
  invitationDeliveryStatus: string | null;
  invitationAttemptCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

@Injectable()
export class PlatformProvisioningOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ProvisioningRunListInput = {}) {
    const status = this.status(input.status);
    const sourceType = this.sourceType(input.sourceType);
    const tenantId = input.tenantId?.trim() || null;
    const limit = this.limit(input.limit);

    const rows = await this.prisma.$queryRaw<ProvisioningRunListRow[]>`
      SELECT
        r.id,
        r.idempotency_key AS "idempotencyKey",
        r.status,
        r.source_type AS "sourceType",
        r.source_id AS "sourceId",
        r.tenant_id AS "tenantId",
        t.name AS "tenantName",
        r.plan_version_id AS "planVersionId",
        r.owner_email AS "ownerEmail",
        r.last_error AS "lastError",
        current_step.step_key AS "currentStep",
        step_summary.total_steps AS "totalSteps",
        step_summary.completed_steps AS "completedSteps",
        step_summary.failed_steps AS "failedSteps",
        step_summary.running_steps AS "runningSteps",
        delivery.status AS "invitationDeliveryStatus",
        delivery.attempt_count AS "invitationAttemptCount",
        r.created_at AS "createdAt",
        r.updated_at AS "updatedAt",
        r.started_at AS "startedAt",
        r.completed_at AS "completedAt"
      FROM platform_provisioning_runs r
      LEFT JOIN tenants t ON t.id = r.tenant_id
      LEFT JOIN platform_owner_invitation_deliveries delivery
        ON delivery.provisioning_run_id = r.id
      CROSS JOIN LATERAL (
        SELECT
          COUNT(*)::bigint AS total_steps,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::bigint AS completed_steps,
          COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed_steps,
          COUNT(*) FILTER (WHERE status = 'RUNNING')::bigint AS running_steps
        FROM platform_provisioning_steps s
        WHERE s.run_id = r.id
      ) step_summary
      LEFT JOIN LATERAL (
        SELECT s.step_key
        FROM platform_provisioning_steps s
        WHERE s.run_id = r.id AND s.status <> 'COMPLETED'
        ORDER BY s.position ASC
        LIMIT 1
      ) current_step ON TRUE
      WHERE (${status}::text IS NULL OR r.status = ${status})
        AND (${sourceType}::text IS NULL OR r.source_type = ${sourceType})
        AND (${tenantId}::text IS NULL OR r.tenant_id = ${tenantId})
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      ...row,
      totalSteps: Number(row.totalSteps),
      completedSteps: Number(row.completedSteps),
      failedSteps: Number(row.failedSteps),
      runningSteps: Number(row.runningSteps),
      completionPercent:
        Number(row.totalSteps) > 0
          ? Math.round((Number(row.completedSteps) / Number(row.totalSteps)) * 100)
          : 0,
    }));
  }

  async summary() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        total: bigint;
        pending: bigint;
        running: bigint;
        failed: bigint;
        completed: bigint;
        invitationPending: bigint;
        invitationFailed: bigint;
      }>
    >`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE r.status = 'PENDING')::bigint AS pending,
        COUNT(*) FILTER (WHERE r.status = 'RUNNING')::bigint AS running,
        COUNT(*) FILTER (WHERE r.status = 'FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE r.status = 'COMPLETED')::bigint AS completed,
        COUNT(*) FILTER (
          WHERE d.status IN ('PENDING','CLAIMED','RETRY')
        )::bigint AS "invitationPending",
        COUNT(*) FILTER (WHERE d.status = 'DEAD')::bigint AS "invitationFailed"
      FROM platform_provisioning_runs r
      LEFT JOIN platform_owner_invitation_deliveries d
        ON d.provisioning_run_id = r.id
    `;
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0n),
      pending: Number(row?.pending ?? 0n),
      running: Number(row?.running ?? 0n),
      failed: Number(row?.failed ?? 0n),
      completed: Number(row?.completed ?? 0n),
      invitationPending: Number(row?.invitationPending ?? 0n),
      invitationFailed: Number(row?.invitationFailed ?? 0n),
    };
  }

  private status(value?: string): RunStatus | null {
    if (!value?.trim()) return null;
    const normalized = value.trim().toUpperCase();
    if (!['PENDING', 'RUNNING', 'FAILED', 'COMPLETED'].includes(normalized)) {
      throw new BadRequestException('Invalid provisioning status filter.');
    }
    return normalized as RunStatus;
  }

  private sourceType(value?: string): SourceType | null {
    if (!value?.trim()) return null;
    const normalized = value.trim().toUpperCase();
    if (!['MANUAL', 'OPPORTUNITY'].includes(normalized)) {
      throw new BadRequestException('Invalid provisioning sourceType filter.');
    }
    return normalized as SourceType;
  }

  private limit(value?: number) {
    if (value == null) return 25;
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100.');
    }
    return value;
  }
}
