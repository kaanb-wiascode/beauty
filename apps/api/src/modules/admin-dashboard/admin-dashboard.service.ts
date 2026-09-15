import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async overview() {
    const context = this.tenantContext.getContext();

    const [membership, invitations, roles, branches, temporaryAccess, mfa, scopeRisk, integrations, recentAudit] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ active: number; suspended: number }>>`
          SELECT
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
            COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended
          FROM memberships
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
        `,
        this.prisma.$queryRaw<Array<{ pending: number }>>`
          SELECT COUNT(*)::int AS pending
          FROM user_invitations
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "acceptedAt" IS NULL
            AND "revokedAt" IS NULL
            AND "expiresAt" > CURRENT_TIMESTAMP
        `,
        this.prisma.$queryRaw<Array<{ total: number }>>`
          SELECT COUNT(*)::int AS total
          FROM roles
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
        `,
        this.prisma.$queryRaw<Array<{ active: number; inactive: number }>>`
          SELECT
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
            COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS inactive
          FROM branches
          WHERE "companyId" = ${context.companyId}
        `,
        this.prisma.$queryRaw<Array<{ active: number; expiringSoon: number }>>`
          SELECT
            COUNT(*) FILTER (
              WHERE "revokedAt" IS NULL
                AND "startsAt" <= CURRENT_TIMESTAMP
                AND "endsAt" > CURRENT_TIMESTAMP
            )::int AS active,
            COUNT(*) FILTER (
              WHERE "revokedAt" IS NULL
                AND "endsAt" > CURRENT_TIMESTAMP
                AND "endsAt" <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
            )::int AS "expiringSoon"
          FROM temporary_permission_grants
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
        `,
        this.prisma.$queryRaw<Array<{ enrolled: number; eligible: number }>>`
          SELECT
            COUNT(*) FILTER (WHERE mfa."enabledAt" IS NOT NULL)::int AS enrolled,
            COUNT(*)::int AS eligible
          FROM memberships m
          LEFT JOIN "user_mfa_totp" mfa ON mfa."userId" = m."userId"
          WHERE m."tenantId" = ${context.tenantId}
            AND m."companyId" = ${context.companyId}
            AND m.status = 'ACTIVE'
        `,
        this.prisma.$queryRaw<Array<{ withoutBranchScope: number; broadCentral: number }>>`
          SELECT
            COUNT(*) FILTER (
              WHERE r.scope <> 'CENTRAL'
                AND NOT EXISTS (
                  SELECT 1 FROM membership_branch_accesses mba WHERE mba."membershipId" = m.id
                )
            )::int AS "withoutBranchScope",
            COUNT(*) FILTER (WHERE r.scope = 'CENTRAL')::int AS "broadCentral"
          FROM memberships m
          JOIN roles r ON r.id = m."roleId"
          WHERE m."tenantId" = ${context.tenantId}
            AND m."companyId" = ${context.companyId}
            AND m.status = 'ACTIVE'
        `,
        this.prisma.$queryRaw<Array<{ total: number; unhealthy: number }>>`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE status <> 'CONNECTED'
                 OR last_error IS NOT NULL
                 OR (consent_expires_at IS NOT NULL AND consent_expires_at <= CURRENT_TIMESTAMP)
            )::int AS unhealthy
          FROM finance_integrations
          WHERE tenant_id = ${context.tenantId}
            AND company_id = ${context.companyId}
            AND (${context.branchId}::text IS NULL OR branch_id = ${context.branchId})
        `,
        this.prisma.$queryRaw<Array<{
          id: string;
          resource: string;
          action: string;
          actorUserId: string;
          targetEntityType: string | null;
          targetEntityId: string | null;
          createdAt: Date;
        }>>`
          SELECT id,
                 resource,
                 action,
                 actor_user_id AS "actorUserId",
                 target_entity_type AS "targetEntityType",
                 target_entity_id AS "targetEntityId",
                 created_at AS "createdAt"
          FROM platform_audit_events
          WHERE target_tenant_id = ${context.tenantId}
            AND (metadata ->> 'companyId' IS NULL OR metadata ->> 'companyId' = ${context.companyId})
          ORDER BY created_at DESC
          LIMIT 8
        `,
      ]);

    const mfaEligible = Number(mfa[0]?.eligible ?? 0);
    const mfaEnrolled = Number(mfa[0]?.enrolled ?? 0);

    return {
      users: {
        active: Number(membership[0]?.active ?? 0),
        suspended: Number(membership[0]?.suspended ?? 0),
        withoutBranchScope: Number(scopeRisk[0]?.withoutBranchScope ?? 0),
        broadCentral: Number(scopeRisk[0]?.broadCentral ?? 0),
      },
      invitations: { pending: Number(invitations[0]?.pending ?? 0) },
      roles: { total: Number(roles[0]?.total ?? 0) },
      branches: {
        active: Number(branches[0]?.active ?? 0),
        inactive: Number(branches[0]?.inactive ?? 0),
      },
      temporaryAccess: {
        active: Number(temporaryAccess[0]?.active ?? 0),
        expiringSoon: Number(temporaryAccess[0]?.expiringSoon ?? 0),
      },
      mfa: {
        enrolled: mfaEnrolled,
        eligible: mfaEligible,
        coveragePercent: mfaEligible ? Number(((mfaEnrolled / mfaEligible) * 100).toFixed(1)) : 100,
      },
      integrations: {
        total: Number(integrations[0]?.total ?? 0),
        unhealthy: Number(integrations[0]?.unhealthy ?? 0),
      },
      recentAudit,
    };
  }
}
