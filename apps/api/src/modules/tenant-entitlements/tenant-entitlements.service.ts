import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type EffectiveEntitlementRow = {
  key: string;
  name: string;
  description: string | null;
  valueType: 'BOOLEAN' | 'INTEGER' | 'STRING' | 'JSON';
  effectiveValue: unknown;
  source: 'OVERRIDE' | 'PLAN' | 'DEFAULT';
  overrideEndsAt: Date | null;
};

@Injectable()
export class TenantEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async effective() {
    const context = this.tenantContext.getContext();
    const items = await this.prisma.$queryRaw<EffectiveEntitlementRow[]>`
      WITH current_subscription AS (
        SELECT s.plan_version_id
        FROM platform_tenant_subscriptions s
        WHERE s.tenant_id = ${context.tenantId}
          AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
        ORDER BY s.created_at DESC
        LIMIT 1
      )
      SELECT
        e.key,
        e.name,
        e.description,
        e.value_type AS "valueType",
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
        ov.ends_at AS "overrideEndsAt"
      FROM platform_entitlements e
      LEFT JOIN current_subscription cs ON TRUE
      LEFT JOIN platform_plan_entitlements pe
        ON pe.plan_version_id = cs.plan_version_id
       AND pe.entitlement_key = e.key
      LEFT JOIN LATERAL (
        SELECT o.id,o.value,o.ends_at
        FROM platform_tenant_entitlement_overrides o
        WHERE o.tenant_id = ${context.tenantId}
          AND o.entitlement_key = e.key
          AND o.status = 'ACTIVE'
          AND o.starts_at <= CURRENT_TIMESTAMP
          AND (o.ends_at IS NULL OR o.ends_at > CURRENT_TIMESTAMP)
        ORDER BY o.starts_at DESC,o.created_at DESC
        LIMIT 1
      ) ov ON TRUE
      WHERE e.status='ACTIVE'
      ORDER BY e.key ASC
    `;
    return { tenantId: context.tenantId, companyId: context.companyId, items };
  }
}
