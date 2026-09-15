import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  TENANT_ENTITLEMENT_KEY,
} from './tenant-entitlement.decorator';
import {
  RESTRICT_TENANT_MUTATIONS_KEY,
} from './tenant-lifecycle-policy.decorator';
import { TenantContext } from './tenant-context';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type EntitlementPolicyRow = {
  configured: boolean;
  effectiveValue: unknown;
};

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; method?: string }>();

    const user = request.user;

    if (
      !user?.tenantId ||
      !user.membershipId ||
      !user.companyId ||
      !user.roleScope
    ) {
      throw new UnauthorizedException(
        'Organization context is missing',
      );
    }

    const lifecycle = await this.prisma.$queryRaw<Array<{ state: string }>>`
      SELECT COALESCE(ptl.state, 'ACTIVE')::text AS state
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      WHERE t.id = ${user.tenantId}
      LIMIT 1
    `;
    const lifecycleState = lifecycle[0]?.state ?? 'ACTIVE';

    if (lifecycleState === 'SUSPENDED') {
      throw new ForbiddenException('Tenant access is suspended by the platform.');
    }

    const entitlementKey = this.reflector.getAllAndOverride<string>(
      TENANT_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (entitlementKey) {
      const entitlement = await this.resolveConfiguredEntitlement(
        user.tenantId,
        entitlementKey,
      );
      if (
        entitlement.configured &&
        entitlement.effectiveValue === false
      ) {
        throw new ForbiddenException(
          `Tenant entitlement ${entitlementKey} is disabled.`,
        );
      }
    }

    const restrictMutations = this.reflector.getAllAndOverride<boolean>(
      RESTRICT_TENANT_MUTATIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const method = (request.method ?? 'GET').toUpperCase();

    if (
      lifecycleState === 'RESTRICTED' &&
      restrictMutations &&
      !SAFE_HTTP_METHODS.has(method)
    ) {
      throw new ForbiddenException(
        'Tenant mutations are restricted by the platform lifecycle policy.',
      );
    }

    this.tenantContext.setContext({
      tenantId: user.tenantId,
      membershipId: user.membershipId,
      companyId: user.companyId,
      branchId: user.branchId ?? null,
      roleScope: user.roleScope,
    });

    return true;
  }

  private async resolveConfiguredEntitlement(
    tenantId: string,
    entitlementKey: string,
  ): Promise<EntitlementPolicyRow> {
    const rows = await this.prisma.$queryRaw<EntitlementPolicyRow[]>`
      WITH current_subscription AS (
        SELECT s.plan_version_id
        FROM platform_tenant_subscriptions s
        WHERE s.tenant_id = ${tenantId}
          AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
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
          WHEN ao.value IS NOT NULL THEN ao.value
          WHEN pe.entitlement_key IS NOT NULL THEN pe.value
          ELSE NULL::jsonb
        END AS "effectiveValue"
      FROM (SELECT 1) seed
      LEFT JOIN active_override ao ON TRUE
      LEFT JOIN current_subscription cs ON TRUE
      LEFT JOIN platform_plan_entitlements pe
        ON pe.plan_version_id = cs.plan_version_id
       AND pe.entitlement_key = ${entitlementKey}
      LIMIT 1
    `;

    return rows[0] ?? { configured: false, effectiveValue: null };
  }
}