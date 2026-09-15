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

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSensitiveKey = (key: string) => {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
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
        correlation_id
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
        ${input.correlationId ?? null}
      )
      RETURNING id, created_at AS "createdAt"
    `;

    return rows[0];
  }
}
