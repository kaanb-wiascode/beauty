import { ForbiddenException, Injectable } from '@nestjs/common';

import { Prisma } from '@beauty-erp/database';

type LimitKey = 'branches.limit' | 'users.limit';
type LimitRow = { configured: boolean; limit: number | null };
type CountRow = { count: number };

@Injectable()
export class TenantEntitlementQuotaService {
  async assertCanAddActiveUser(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    return this.assertCapacity(tx, tenantId, 'users.limit', async () => {
      const rows = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(DISTINCT m.user_id)::int AS count
        FROM memberships m
        WHERE m.tenant_id = ${tenantId} AND m.status = 'ACTIVE'
      `;
      return rows[0]?.count ?? 0;
    });
  }

  async assertCanActivateBranch(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ) {
    return this.assertCapacity(tx, tenantId, 'branches.limit', async () => {
      const rows = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS count
        FROM branches b
        INNER JOIN companies c ON c.id = b.company_id
        WHERE c.tenant_id = ${tenantId} AND b.status = 'ACTIVE'
      `;
      return rows[0]?.count ?? 0;
    });
  }

  private async assertCapacity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entitlementKey: LimitKey,
    usage: () => Promise<number>,
  ) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${entitlementKey}`}))
    `;

    const entitlement = await this.resolveConfiguredIntegerLimit(
      tx,
      tenantId,
      entitlementKey,
    );
    if (!entitlement.configured || entitlement.limit === null) {
      return { configured: false as const, current: null, limit: null };
    }

    const current = await usage();
    if (current >= entitlement.limit) {
      throw new ForbiddenException(
        `Tenant entitlement quota ${entitlementKey} is exhausted (${current}/${entitlement.limit}).`,
      );
    }

    return {
      configured: true as const,
      current,
      limit: entitlement.limit,
    };
  }

  private async resolveConfiguredIntegerLimit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entitlementKey: LimitKey,
  ): Promise<LimitRow> {
    const rows = await tx.$queryRaw<LimitRow[]>`
      WITH current_subscription AS (
        SELECT s.plan_version_id
        FROM platform_tenant_subscriptions s
        WHERE s.tenant_id = ${tenantId}
          AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
        ORDER BY s.created_at DESC
        LIMIT 1
      ), active_override AS (
        SELECT o.value
        FROM platform_tenant_entitlement_overrides o
        WHERE o.tenant_id = ${tenantId}
          AND o.entitlement_key = ${entitlementKey}
          AND o.status = 'ACTIVE'
          AND o.starts_at <= CURRENT_TIMESTAMP
          AND (o.ends_at IS NULL OR o.ends_at > CURRENT_TIMESTAMP)
        ORDER BY o.starts_at DESC, o.created_at DESC
        LIMIT 1
      )
      SELECT
        (ao.value IS NOT NULL OR pe.entitlement_key IS NOT NULL) AS configured,
        CASE
          WHEN ao.value IS NOT NULL THEN (ao.value #>> '{}')::int
          WHEN pe.entitlement_key IS NOT NULL THEN (pe.value #>> '{}')::int
          ELSE NULL::int
        END AS limit
      FROM (SELECT 1) seed
      LEFT JOIN active_override ao ON TRUE
      LEFT JOIN current_subscription cs ON TRUE
      LEFT JOIN platform_plan_entitlements pe
        ON pe.plan_version_id = cs.plan_version_id
       AND pe.entitlement_key = ${entitlementKey}
      LIMIT 1
    `;

    return rows[0] ?? { configured: false, limit: null };
  }
}
