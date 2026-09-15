import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type EntitlementCatalogRow = {
  key: string;
  name: string;
  description: string | null;
  valueType: 'BOOLEAN' | 'INTEGER' | 'STRING' | 'JSON';
  defaultValue: unknown;
  status: string;
};

type EffectiveEntitlementRow = EntitlementCatalogRow & {
  planValue: unknown;
  overrideId: string | null;
  overrideValue: unknown;
  overrideStartsAt: Date | null;
  overrideEndsAt: Date | null;
  effectiveValue: unknown;
  source: 'OVERRIDE' | 'PLAN' | 'DEFAULT';
};

@Injectable()
export class PlatformEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async listCatalog() {
    return this.prisma.$queryRaw<EntitlementCatalogRow[]>`
      SELECT
        e.key,
        e.name,
        e.description,
        e.value_type AS "valueType",
        e.default_value AS "defaultValue",
        e.status
      FROM platform_entitlements e
      ORDER BY e.key ASC
    `;
  }

  async getTenantEntitlements(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const rows = await this.prisma.$queryRaw<EffectiveEntitlementRow[]>`
      WITH current_subscription AS (
        SELECT s.plan_version_id
        FROM platform_tenant_subscriptions s
        WHERE s.tenant_id = ${tenantId}
          AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
        ORDER BY s.created_at DESC
        LIMIT 1
      )
      SELECT
        e.key,
        e.name,
        e.description,
        e.value_type AS "valueType",
        e.default_value AS "defaultValue",
        pe.value AS "planValue",
        ov.id AS "overrideId",
        ov.value AS "overrideValue",
        ov.starts_at AS "overrideStartsAt",
        ov.ends_at AS "overrideEndsAt",
        CASE
          WHEN ov.id IS NOT NULL THEN ov.value
          WHEN pe.entitlement_key IS NOT NULL THEN pe.value
          ELSE e.default_value
        END AS "effectiveValue",
        CASE
          WHEN ov.id IS NOT NULL THEN 'OVERRIDE'
          WHEN pe.entitlement_key IS NOT NULL THEN 'PLAN'
          ELSE 'DEFAULT'
        END AS source,
        e.status
      FROM platform_entitlements e
      LEFT JOIN current_subscription cs ON TRUE
      LEFT JOIN platform_plan_entitlements pe
        ON pe.plan_version_id = cs.plan_version_id
       AND pe.entitlement_key = e.key
      LEFT JOIN LATERAL (
        SELECT o.id, o.value, o.starts_at, o.ends_at
        FROM platform_tenant_entitlement_overrides o
        WHERE o.tenant_id = ${tenantId}
          AND o.entitlement_key = e.key
          AND o.status = 'ACTIVE'
          AND o.starts_at <= CURRENT_TIMESTAMP
          AND (o.ends_at IS NULL OR o.ends_at > CURRENT_TIMESTAMP)
        ORDER BY o.starts_at DESC, o.created_at DESC
        LIMIT 1
      ) ov ON TRUE
      WHERE e.status = 'ACTIVE'
      ORDER BY e.key ASC
    `;
    return { tenantId, items: rows };
  }

  async setPlanEntitlement(
    actorUserId: string,
    planVersionId: string,
    entitlementKey: string,
    value: unknown,
  ) {
    const entitlement = await this.requireEntitlement(entitlementKey);
    await this.assertPlanVersionExists(planVersionId);
    const normalized = this.validateValue(entitlement.valueType, value);
    const beforeRows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT value FROM platform_plan_entitlements
      WHERE plan_version_id = ${planVersionId} AND entitlement_key = ${entitlementKey}
      LIMIT 1
    `;
    await this.prisma.$executeRaw`
      INSERT INTO platform_plan_entitlements (plan_version_id, entitlement_key, value)
      VALUES (${planVersionId}, ${entitlementKey}, ${JSON.stringify(normalized)}::jsonb)
      ON CONFLICT (plan_version_id, entitlement_key)
      DO UPDATE SET value = EXCLUDED.value
    `;
    await this.audit.record({
      actorUserId,
      resource: 'entitlements',
      action: 'plan_value.set',
      targetEntityType: 'plan_version',
      targetEntityId: planVersionId,
      beforeState: beforeRows[0] ?? null,
      afterState: { entitlementKey, value: normalized },
    });
    return { planVersionId, entitlementKey, value: normalized };
  }

  async createOverride(
    actorUserId: string,
    tenantId: string,
    input: { entitlementKey: string; value: unknown; reason: string; startsAt?: string | null; endsAt?: string | null },
  ) {
    await this.assertTenantExists(tenantId);
    const entitlement = await this.requireEntitlement(input.entitlementKey);
    const value = this.validateValue(entitlement.valueType, input.value);
    const reason = input.reason.trim();
    if (reason.length < 8 || reason.length > 500) {
      throw new BadRequestException('Entitlement override reason must contain between 8 and 500 characters.');
    }
    const startsAt = this.parseDate(input.startsAt, new Date());
    const endsAt = input.endsAt ? this.parseDate(input.endsAt) : null;
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('Entitlement override end must be after its start.');
    }
    const rows = await this.prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>`
      INSERT INTO platform_tenant_entitlement_overrides (
        tenant_id, entitlement_key, value, reason, starts_at, ends_at, created_by_user_id
      ) VALUES (
        ${tenantId}, ${input.entitlementKey}, ${JSON.stringify(value)}::jsonb,
        ${reason}, ${startsAt}, ${endsAt}, ${actorUserId}
      )
      RETURNING id, created_at AS "createdAt"
    `;
    const created = rows[0];
    await this.audit.record({
      actorUserId,
      resource: 'entitlements',
      action: 'override.create',
      targetTenantId: tenantId,
      targetEntityType: 'entitlement_override',
      targetEntityId: created?.id ?? null,
      reason,
      afterState: { entitlementKey: input.entitlementKey, value, startsAt, endsAt },
    });
    return { id: created?.id, entitlementKey: input.entitlementKey, value, startsAt, endsAt, createdAt: created?.createdAt };
  }

  async revokeOverride(actorUserId: string, tenantId: string, overrideId: string, reason: string) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 8 || normalizedReason.length > 500) {
      throw new BadRequestException('Override revocation reason must contain between 8 and 500 characters.');
    }
    const beforeRows = await this.prisma.$queryRaw<Array<{ id: string; entitlementKey: string; value: unknown; status: string }>>`
      SELECT id, entitlement_key AS "entitlementKey", value, status
      FROM platform_tenant_entitlement_overrides
      WHERE id = ${overrideId} AND tenant_id = ${tenantId}
      LIMIT 1
    `;
    const before = beforeRows[0];
    if (!before) throw new NotFoundException('Entitlement override was not found.');
    if (before.status !== 'ACTIVE') throw new BadRequestException('Entitlement override is already revoked.');
    await this.prisma.$executeRaw`
      UPDATE platform_tenant_entitlement_overrides
      SET status = 'REVOKED'
      WHERE id = ${overrideId} AND tenant_id = ${tenantId} AND status = 'ACTIVE'
    `;
    await this.audit.record({
      actorUserId,
      resource: 'entitlements',
      action: 'override.revoke',
      targetTenantId: tenantId,
      targetEntityType: 'entitlement_override',
      targetEntityId: overrideId,
      reason: normalizedReason,
      beforeState: before,
      afterState: { ...before, status: 'REVOKED' },
    });
    return { id: overrideId, status: 'REVOKED' as const };
  }

  private async requireEntitlement(key: string) {
    const rows = await this.prisma.$queryRaw<EntitlementCatalogRow[]>`
      SELECT key, name, description, value_type AS "valueType", default_value AS "defaultValue", status
      FROM platform_entitlements WHERE key = ${key} AND status = 'ACTIVE' LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Entitlement was not found.');
    return rows[0];
  }

  private async assertTenantExists(tenantId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`;
    if (!rows[0]) throw new NotFoundException('Platform customer tenant was not found.');
  }

  private async assertPlanVersionExists(planVersionId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform_plan_versions WHERE id = ${planVersionId} LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Platform plan version was not found.');
  }

  private validateValue(type: EntitlementCatalogRow['valueType'], value: unknown) {
    if (type === 'BOOLEAN' && typeof value !== 'boolean') throw new BadRequestException('Entitlement value must be boolean.');
    if (type === 'INTEGER' && (!Number.isInteger(value) || (value as number) < 0)) throw new BadRequestException('Entitlement value must be a non-negative integer.');
    if (type === 'STRING' && typeof value !== 'string') throw new BadRequestException('Entitlement value must be a string.');
    return value;
  }

  private parseDate(value: string | null | undefined, fallback?: Date) {
    if (!value) {
      if (fallback) return fallback;
      throw new BadRequestException('Date value is required.');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date value.');
    return date;
  }
}
