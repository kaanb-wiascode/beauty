import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type HealthSnapshotRow = {
  id: string;
  tenantId: string;
  totalScore: number;
  lifecycleScore: number;
  subscriptionScore: number;
  provisioningScore: number;
  ownerAccessScore: number;
  onboardingScore: number;
  riskBand: 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'CRITICAL';
  reasons: unknown;
  calculatedByPlatformUserId: string;
  calculatedAt: Date;
};

@Injectable()
export class PlatformTenantHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async recalculate(
    tenantId: string,
    actorUserId: string,
    reason = 'Tenant health recalculation.',
    correlationId?: string | null,
  ) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Tenant health recalculation requires a reason.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext('platform-tenant-health'), hashtext(${tenantId}))
      `;

      const tenants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1
      `;
      if (!tenants[0]) throw new NotFoundException('Tenant not found.');

      const lifecycleRows = await tx.$queryRaw<Array<{ state: string | null }>>`
        SELECT state
        FROM platform_tenant_lifecycle
        WHERE tenant_id = ${tenantId}
        LIMIT 1
      `;
      const subscriptionRows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status
        FROM platform_tenant_subscriptions
        WHERE tenant_id = ${tenantId}
        ORDER BY
          CASE WHEN status IN ('ACTIVE','TRIAL','PAST_DUE') THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
      `;
      const provisioningRows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status
        FROM platform_provisioning_runs
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `;
      const ownerRows = await tx.$queryRaw<Array<{ active: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM memberships m
          JOIN roles r
            ON r.id = m."roleId"
           AND r."tenantId" = m."tenantId"
           AND r."companyId" = m."companyId"
          WHERE m."tenantId" = ${tenantId}
            AND m.status = 'ACTIVE'
            AND r.slug = 'owner'
            AND r.scope = 'CENTRAL'
        ) AS active
      `;
      const onboardingRows = await tx.$queryRaw<
        Array<{
          status: string | null;
          requiredCount: bigint;
          completedRequiredCount: bigint;
          blockedCount: bigint;
        }>
      >`
        SELECT
          o.status,
          COUNT(i.id) FILTER (WHERE i.required = TRUE)::bigint AS "requiredCount",
          COUNT(i.id) FILTER (WHERE i.required = TRUE AND i.status = 'COMPLETED')::bigint AS "completedRequiredCount",
          COUNT(i.id) FILTER (WHERE i.status = 'BLOCKED')::bigint AS "blockedCount"
        FROM platform_tenant_onboarding o
        LEFT JOIN platform_tenant_onboarding_items i ON i.onboarding_id = o.id
        WHERE o.tenant_id = ${tenantId}
        GROUP BY o.id, o.status
        LIMIT 1
      `;

      const lifecycleState = lifecycleRows[0]?.state ?? 'MISSING';
      const subscriptionStatus = subscriptionRows[0]?.status ?? 'MISSING';
      const provisioningStatus = provisioningRows[0]?.status ?? 'MISSING';
      const ownerActive = ownerRows[0]?.active === true;
      const onboarding = onboardingRows[0];
      const requiredCount = Number(onboarding?.requiredCount ?? 0n);
      const completedRequiredCount = Number(onboarding?.completedRequiredCount ?? 0n);
      const blockedCount = Number(onboarding?.blockedCount ?? 0n);

      const lifecycleScore =
        lifecycleState === 'ACTIVE' ? 20 : lifecycleState === 'RESTRICTED' ? 8 : 0;
      const subscriptionScore =
        subscriptionStatus === 'ACTIVE'
          ? 20
          : subscriptionStatus === 'TRIAL'
            ? 16
            : subscriptionStatus === 'PAST_DUE'
              ? 6
              : 0;
      const provisioningScore =
        provisioningStatus === 'COMPLETED'
          ? 20
          : provisioningStatus === 'RUNNING'
            ? 10
            : provisioningStatus === 'PENDING'
              ? 5
              : 0;
      const ownerAccessScore = ownerActive ? 20 : 0;
      const onboardingScore =
        onboarding?.status === 'COMPLETED'
          ? 20
          : requiredCount > 0
            ? Math.max(
                0,
                Math.min(
                  20,
                  Math.round((completedRequiredCount / requiredCount) * 20) -
                    (blockedCount > 0 ? 2 : 0),
                ),
              )
            : 0;
      const totalScore =
        lifecycleScore +
        subscriptionScore +
        provisioningScore +
        ownerAccessScore +
        onboardingScore;
      const riskBand: HealthSnapshotRow['riskBand'] =
        totalScore >= 85
          ? 'HEALTHY'
          : totalScore >= 65
            ? 'WATCH'
            : totalScore >= 40
              ? 'AT_RISK'
              : 'CRITICAL';

      const reasons: string[] = [];
      if (lifecycleScore < 20) reasons.push(`LIFECYCLE_${lifecycleState}`);
      if (subscriptionScore < 20) reasons.push(`SUBSCRIPTION_${subscriptionStatus}`);
      if (provisioningScore < 20) reasons.push(`PROVISIONING_${provisioningStatus}`);
      if (!ownerActive) reasons.push('OWNER_ACCESS_MISSING');
      if (!onboarding) reasons.push('ONBOARDING_MISSING');
      else if (blockedCount > 0) reasons.push('ONBOARDING_BLOCKED');
      else if (onboardingScore < 20) reasons.push('ONBOARDING_INCOMPLETE');

      const rows = await tx.$queryRaw<HealthSnapshotRow[]>`
        INSERT INTO platform_tenant_health_snapshots (
          tenant_id,
          total_score,
          lifecycle_score,
          subscription_score,
          provisioning_score,
          owner_access_score,
          onboarding_score,
          risk_band,
          reasons,
          calculated_by_platform_user_id
        ) VALUES (
          ${tenantId},
          ${totalScore},
          ${lifecycleScore},
          ${subscriptionScore},
          ${provisioningScore},
          ${ownerAccessScore},
          ${onboardingScore},
          ${riskBand},
          ${JSON.stringify(reasons)}::jsonb,
          ${actorUserId}
        )
        RETURNING
          id,
          tenant_id AS "tenantId",
          total_score AS "totalScore",
          lifecycle_score AS "lifecycleScore",
          subscription_score AS "subscriptionScore",
          provisioning_score AS "provisioningScore",
          owner_access_score AS "ownerAccessScore",
          onboarding_score AS "onboardingScore",
          risk_band AS "riskBand",
          reasons,
          calculated_by_platform_user_id AS "calculatedByPlatformUserId",
          calculated_at AS "calculatedAt"
      `;
      const snapshot = rows[0];

      await this.audit.record(
        {
          actorUserId,
          resource: 'tenant_health',
          action: 'snapshot.recalculate',
          targetTenantId: tenantId,
          targetEntityType: 'platform_tenant_health_snapshot',
          targetEntityId: snapshot.id,
          reason: normalizedReason,
          afterState: snapshot,
          metadata: {
            lifecycleState,
            subscriptionStatus,
            provisioningStatus,
            ownerActive,
            requiredOnboardingItems: requiredCount,
            completedRequiredOnboardingItems: completedRequiredCount,
            blockedOnboardingItems: blockedCount,
          },
          correlationId: correlationId ?? null,
        },
        tx,
      );

      return snapshot;
    });
  }

  async getLatest(tenantId: string) {
    const rows = await this.prisma.$queryRaw<HealthSnapshotRow[]>`
      SELECT
        id,
        tenant_id AS "tenantId",
        total_score AS "totalScore",
        lifecycle_score AS "lifecycleScore",
        subscription_score AS "subscriptionScore",
        provisioning_score AS "provisioningScore",
        owner_access_score AS "ownerAccessScore",
        onboarding_score AS "onboardingScore",
        risk_band AS "riskBand",
        reasons,
        calculated_by_platform_user_id AS "calculatedByPlatformUserId",
        calculated_at AS "calculatedAt"
      FROM platform_tenant_health_snapshots
      WHERE tenant_id = ${tenantId}
      ORDER BY calculated_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async listLatest(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200.');
    }
    return this.prisma.$queryRaw<HealthSnapshotRow[]>`
      SELECT DISTINCT ON (tenant_id)
        id,
        tenant_id AS "tenantId",
        total_score AS "totalScore",
        lifecycle_score AS "lifecycleScore",
        subscription_score AS "subscriptionScore",
        provisioning_score AS "provisioningScore",
        owner_access_score AS "ownerAccessScore",
        onboarding_score AS "onboardingScore",
        risk_band AS "riskBand",
        reasons,
        calculated_by_platform_user_id AS "calculatedByPlatformUserId",
        calculated_at AS "calculatedAt"
      FROM platform_tenant_health_snapshots
      ORDER BY tenant_id, calculated_at DESC, id DESC
      LIMIT ${limit}
    `;
  }
}
