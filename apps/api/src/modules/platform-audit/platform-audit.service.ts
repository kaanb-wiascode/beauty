import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

export type PlatformAuditRecordInput = {
  actorUserId: string;
  resource: string;
  action: string;
  targetTenantId?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
  correlationId?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  riskLevel?: string | null;
  approvalRequestId?: string | null;
};

export type TenantAuditFilter = {
  actorUserId?: string;
  resource?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  companyId?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

type PlatformAuditQueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'privatekey',
  'apikey',
  'credential',
];

const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (key: string) => {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
};

const optionalTrimmed = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function redactPlatformAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactPlatformAuditPayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactPlatformAuditPayload(child),
      ]),
    );
  }

  return value;
}

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: PlatformAuditRecordInput,
    client?: PlatformAuditQueryClient,
  ) {
    const actorUserId = input.actorUserId.trim();
    const resource = input.resource.trim();
    const action = input.action.trim();

    if (!actorUserId || !resource || !action) {
      throw new BadRequestException(
        'Platform audit requires actorUserId, resource and action.',
      );
    }

    const beforeState = JSON.stringify(
      redactPlatformAuditPayload(input.beforeState ?? null),
    );
    const afterState = JSON.stringify(
      redactPlatformAuditPayload(input.afterState ?? null),
    );
    const metadata = JSON.stringify(
      redactPlatformAuditPayload(input.metadata ?? {}),
    );
    const db: PlatformAuditQueryClient = client ?? this.prisma;

    const rows = await db.$queryRaw<
      Array<{ id: string; createdAt: Date }>
    >`
      INSERT INTO platform_audit_events (
        actor_user_id,
        resource,
        action,
        target_tenant_id,
        target_entity_type,
        target_entity_id,
        reason,
        before_state,
        after_state,
        metadata,
        correlation_id,
        request_id,
        source_ip,
        user_agent,
        risk_level,
        approval_request_id
      ) VALUES (
        ${actorUserId},
        ${resource},
        ${action},
        ${input.targetTenantId ?? null},
        ${input.targetEntityType ?? null},
        ${input.targetEntityId ?? null},
        ${input.reason ?? null},
        ${beforeState}::jsonb,
        ${afterState}::jsonb,
        ${metadata}::jsonb,
        ${input.correlationId ?? null},
        ${input.requestId ?? null},
        ${input.sourceIp ?? null},
        ${input.userAgent ?? null},
        ${input.riskLevel ?? null},
        ${input.approvalRequestId ?? null}
      )
      RETURNING id, created_at AS "createdAt"
    `;

    return rows[0];
  }

  async findTenantEvents(tenantId: string, filter: TenantAuditFilter = {}) {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) {
      throw new BadRequestException('Tenant audit requires tenant context.');
    }

    const actorUserId = optionalTrimmed(filter.actorUserId);
    const resource = optionalTrimmed(filter.resource);
    const action = optionalTrimmed(filter.action);
    const entityType = optionalTrimmed(filter.entityType);
    const entityId = optionalTrimmed(filter.entityId);
    const companyId = optionalTrimmed(filter.companyId);
    const branchId = optionalTrimmed(filter.branchId);
    const from = filter.from ?? null;
    const to = filter.to ?? null;
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 200));

    if (from && to && from > to) {
      throw new BadRequestException('Audit date range is invalid.');
    }

    return this.prisma.$queryRaw<
      Array<{
        id: string;
        actorUserId: string;
        resource: string;
        action: string;
        targetEntityType: string | null;
        targetEntityId: string | null;
        reason: string | null;
        beforeState: unknown;
        afterState: unknown;
        metadata: unknown;
        correlationId: string | null;
        createdAt: Date;
      }>
    >`
      SELECT
        id,
        actor_user_id AS "actorUserId",
        resource,
        action,
        target_entity_type AS "targetEntityType",
        target_entity_id AS "targetEntityId",
        reason,
        before_state AS "beforeState",
        after_state AS "afterState",
        metadata,
        correlation_id AS "correlationId",
        created_at AS "createdAt"
      FROM platform_audit_events
      WHERE target_tenant_id = ${normalizedTenantId}
        AND (${actorUserId}::text IS NULL OR actor_user_id = ${actorUserId})
        AND (${resource}::text IS NULL OR resource = ${resource})
        AND (${action}::text IS NULL OR action = ${action})
        AND (${entityType}::text IS NULL OR target_entity_type = ${entityType})
        AND (${entityId}::text IS NULL OR target_entity_id = ${entityId})
        AND (${companyId}::text IS NULL OR metadata->>'companyId' = ${companyId})
        AND (${branchId}::text IS NULL OR metadata->>'branchId' = ${branchId})
        AND (${from}::timestamp IS NULL OR created_at >= ${from})
        AND (${to}::timestamp IS NULL OR created_at <= ${to})
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `;
  }
}
