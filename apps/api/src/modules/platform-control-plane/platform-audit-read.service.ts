import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

export type PlatformAuditQuery = {
  actorUserId?: string;
  resource?: string;
  action?: string;
  targetTenantId?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
};

type PlatformAuditRow = {
  id: string;
  actorUserId: string;
  actorEmail: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  resource: string;
  action: string;
  targetTenantId: string | null;
  targetEntityType: string | null;
  targetEntityId: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  correlationId: string | null;
  createdAt: Date;
  totalCount: number;
};

@Injectable()
export class PlatformAuditReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformAuditQuery = {}) {
    const actorUserId = this.clean(query.actorUserId);
    const resource = this.clean(query.resource);
    const action = this.clean(query.action);
    const targetTenantId = this.clean(query.targetTenantId);
    const correlationId = this.clean(query.correlationId);
    const limit = this.clampInteger(query.limit, 50, 1, 100);
    const offset = this.clampInteger(query.offset, 0, 0, 100_000);

    const rows = await this.prisma.$queryRaw<PlatformAuditRow[]>`
      SELECT
        pae.id,
        pae.actor_user_id AS "actorUserId",
        u.email AS "actorEmail",
        u."firstName" AS "actorFirstName",
        u."lastName" AS "actorLastName",
        pae.resource,
        pae.action,
        pae.target_tenant_id AS "targetTenantId",
        pae.target_entity_type AS "targetEntityType",
        pae.target_entity_id AS "targetEntityId",
        pae.reason,
        pae.before_state AS "beforeState",
        pae.after_state AS "afterState",
        pae.metadata,
        pae.correlation_id AS "correlationId",
        pae.created_at AS "createdAt",
        COUNT(*) OVER()::int AS "totalCount"
      FROM platform_audit_events pae
      LEFT JOIN users u ON u.id = pae.actor_user_id
      WHERE (${actorUserId} = '' OR pae.actor_user_id = ${actorUserId})
        AND (${resource} = '' OR pae.resource = ${resource})
        AND (${action} = '' OR pae.action = ${action})
        AND (${targetTenantId} = '' OR pae.target_tenant_id = ${targetTenantId})
        AND (${correlationId} = '' OR pae.correlation_id = ${correlationId})
      ORDER BY pae.created_at DESC, pae.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return {
      items: rows.map(({ totalCount: _totalCount, ...row }) => row),
      pagination: {
        total: rows[0]?.totalCount ?? 0,
        limit,
        offset,
      },
    };
  }

  private clean(value?: string) {
    return (value ?? '').trim().slice(0, 200);
  }

  private clampInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (!Number.isInteger(value)) return fallback;
    return Math.min(max, Math.max(min, value as number));
  }
}
