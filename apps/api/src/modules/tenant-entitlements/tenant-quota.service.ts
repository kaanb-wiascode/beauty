import { ConflictException, Injectable } from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

type QuotaKey = 'users.limit' | 'branches.limit';

type EffectiveQuotaRow = {
  effectiveValue: unknown;
  source: 'OVERRIDE' | 'PLAN' | 'DEFAULT';
};

@Injectable()
export class TenantQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async assertUserActivationAllowed(
    tenantId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.lockTenantQuota(tenantId, tx);

    const quota = await this.resolveConfiguredIntegerQuota(
      tenantId,
      'users.limit',
      tx,
    );
    if (quota === null) return;

    const alreadyActive = await tx.membership.findFirst({
      where: { tenantId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (alreadyActive) return;

    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT m.user_id)::bigint AS count
      FROM memberships m
      WHERE m.tenant_id = ${tenantId}
        AND m.status = 'ACTIVE'
    `;
    const current = Number(rows[0]?.count ?? 0n);
    this.assertWithinLimit('users.limit', quota, current);
  }

  async assertBranchActivationAllowed(
    tenantId: string,
    branchId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.lockTenantQuota(tenantId, tx);

    const quota = await this.resolveConfiguredIntegerQuota(
      tenantId,
      'branches.limit',
      tx,
    );
    if (quota === null) return;

    const branch = await tx.branch.findFirst({
      where: { id: branchId, company: { tenantId } },
      select: { status: true },
    });
    if (!branch || branch.status === 'ACTIVE') return;

    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM branches b
      INNER JOIN companies c ON c.id = b.company_id
      WHERE c.tenant_id = ${tenantId}
        AND b.status = 'ACTIVE'
    `;
    const current = Number(rows[0]?.count ?? 0n);
    this.assertWithinLimit('branches.limit', quota, current);
  }

  private async lockTenantQuota(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('tenant-quota'),
        hashtext(${tenantId})
      )
    `;
  }

  private async resolveConfiguredIntegerQuota(
    tenantId: string,
    key: QuotaKey,
    tx: Prisma.TransactionClient,
  ): Promise<number | null> {
    const rows = await tx.$queryRaw<EffectiveQuotaRow[]>`
      WITH current_subscription AS (
        SELECT s.plan_version_id
        FROM platform_tenant_subscriptions s
        WHERE s.tenant_id = ${tenantId}
          AND s.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
        ORDER BY s.created_at DESC
        LIMIT 1
      )
      SELECT
        CASE
          WHEN ov.id IS NOT NULL THEN ov.value
          WHEN pe.entitlement_key IS NOT NULL THEN pe.value
          ELSE e.default_value
        END AS "effectiveValue",
        CASE
          WHEN ov.id IS NOT NULL THEN 'OVERRIDE'
          WHEN pe.entitlement_key IS NOT NULL THEN 'PLAN'
          ELSE 'DEFAULT'
        END AS source
      FROM platform_entitlements e
      LEFT JOIN current_subscription cs ON TRUE
      LEFT JOIN platform_plan_entitlements pe
        ON pe.plan_version_id = cs.plan_version_id
       AND pe.entitlement_key = e.key
      LEFT JOIN LATERAL (
        SELECT o.id, o.value
        FROM platform_tenant_entitlement_overrides o
        WHERE o.tenant_id = ${tenantId}
          AND o.entitlement_key = e.key
          AND o.status = 'ACTIVE'
          AND o.starts_at <= CURRENT_TIMESTAMP
          AND (o.ends_at IS NULL OR o.ends_at > CURRENT_TIMESTAMP)
        ORDER BY o.starts_at DESC, o.created_at DESC
        LIMIT 1
      ) ov ON TRUE
      WHERE e.key = ${key}
        AND e.status = 'ACTIVE'
        AND e.value_type = 'INTEGER'
      LIMIT 1
    `;

    const row = rows[0];
    // DEFAULT means this tenant has no explicit quota configuration. Keep legacy
    // tenants unblocked until a plan entitlement or tenant override sets a limit.
    if (!row || row.source === 'DEFAULT') return null;

    const value = this.toInteger(row.effectiveValue);
    return value === null || value < 0 ? null : value;
  }

  private toInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
  }

  private assertWithinLimit(key: QuotaKey, limit: number, current: number) {
    if (current < limit) return;

    throw new ConflictException({
      code: 'TENANT_QUOTA_EXCEEDED',
      entitlementKey: key,
      limit,
      current,
      message: `Tenant quota exceeded for ${key}`,
    });
  }
}
