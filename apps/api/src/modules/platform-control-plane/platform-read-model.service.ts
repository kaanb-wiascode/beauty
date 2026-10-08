import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

type CommandCenterCounts = {
  tenantCount: number;
  restrictedTenantCount: number;
  suspendedTenantCount: number;
  companyCount: number;
  activeCompanyCount: number;
  branchCount: number;
  activeBranchCount: number;
  activeMembershipCount: number;
};

type TenantListRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  lifecycleState: string;
  lifecycleReason: string | null;
  lifecycleVersion: number;
  lifecycleUpdatedAt: Date | null;
  companyCount: number;
  activeCompanyCount: number;
  branchCount: number;
  activeBranchCount: number;
  activeMembershipCount: number;
  ownerCount: number;
  totalCount: number;
};

type TenantOverviewRow = Omit<TenantListRow, 'totalCount'>;

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  branchCount: number;
  activeBranchCount: number;
};

type MembershipBreakdownRow = {
  role: string;
  status: string;
  count: number;
};

export type PlatformTenantListQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

@Injectable()
export class PlatformReadModelService {
  constructor(private readonly prisma: PrismaService) {}

  async getCommandCenter() {
    const [counts] = await this.prisma.$queryRaw<CommandCenterCounts[]>`
      SELECT
        (SELECT COUNT(*)::int FROM tenants) AS "tenantCount",
        (SELECT COUNT(*)::int FROM platform_tenant_lifecycle WHERE state = 'RESTRICTED') AS "restrictedTenantCount",
        (SELECT COUNT(*)::int FROM platform_tenant_lifecycle WHERE state = 'SUSPENDED') AS "suspendedTenantCount",
        (SELECT COUNT(*)::int FROM companies) AS "companyCount",
        (SELECT COUNT(*)::int FROM companies WHERE status = 'ACTIVE') AS "activeCompanyCount",
        (SELECT COUNT(*)::int FROM branches) AS "branchCount",
        (SELECT COUNT(*)::int FROM branches WHERE status = 'ACTIVE') AS "activeBranchCount",
        (SELECT COUNT(*)::int FROM memberships WHERE status = 'ACTIVE') AS "activeMembershipCount"
    `;

    const recentTenants = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        createdAt: Date;
        lifecycleState: string;
        lifecycleVersion: number;
        activeMembershipCount: number;
        activeBranchCount: number;
      }>
    >`
      SELECT
        t.id,
        t.name,
        t.slug,
        t."createdAt",
        COALESCE(ptl.state, 'ACTIVE')::text AS "lifecycleState",
        COALESCE(ptl.version, 0)::int AS "lifecycleVersion",
        (
          SELECT COUNT(*)::int
          FROM memberships m
          WHERE m."tenantId" = t.id
            AND m.status = 'ACTIVE'
        ) AS "activeMembershipCount",
        (
          SELECT COUNT(*)::int
          FROM branches b
          INNER JOIN companies c ON c.id = b."companyId"
          WHERE c."tenantId" = t.id
            AND b.status = 'ACTIVE'
        ) AS "activeBranchCount"
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      ORDER BY t."createdAt" DESC, t.id ASC
      LIMIT 5
    `;

    return {
      counts: counts ?? {
        tenantCount: 0,
        restrictedTenantCount: 0,
        suspendedTenantCount: 0,
        companyCount: 0,
        activeCompanyCount: 0,
        branchCount: 0,
        activeBranchCount: 0,
        activeMembershipCount: 0,
      },
      recentTenants,
    };
  }

  async listTenants(query: PlatformTenantListQuery = {}) {
    const search = (query.search ?? '').trim().slice(0, 100);
    const searchPattern = `%${search}%`;
    const limit = this.clampInteger(query.limit, 25, 1, 100);
    const offset = this.clampInteger(query.offset, 0, 0, 100_000);

    const rows = await this.prisma.$queryRaw<TenantListRow[]>`
      SELECT
        t.id,
        t.name,
        t.slug,
        t."createdAt",
        t."updatedAt",
        COALESCE(ptl.state, 'ACTIVE')::text AS "lifecycleState",
        ptl.reason AS "lifecycleReason",
        COALESCE(ptl.version, 0)::int AS "lifecycleVersion",
        ptl.updated_at AS "lifecycleUpdatedAt",
        (
          SELECT COUNT(*)::int FROM companies c
          WHERE c."tenantId" = t.id
        ) AS "companyCount",
        (
          SELECT COUNT(*)::int FROM companies c
          WHERE c."tenantId" = t.id AND c.status = 'ACTIVE'
        ) AS "activeCompanyCount",
        (
          SELECT COUNT(*)::int
          FROM branches b
          INNER JOIN companies c ON c.id = b."companyId"
          WHERE c."tenantId" = t.id
        ) AS "branchCount",
        (
          SELECT COUNT(*)::int
          FROM branches b
          INNER JOIN companies c ON c.id = b."companyId"
          WHERE c."tenantId" = t.id AND b.status = 'ACTIVE'
        ) AS "activeBranchCount",
        (
          SELECT COUNT(*)::int FROM memberships m
          WHERE m."tenantId" = t.id AND m.status = 'ACTIVE'
        ) AS "activeMembershipCount",
        (
          SELECT COUNT(*)::int
          FROM memberships m
          INNER JOIN roles r ON r.id = m."roleId"
          WHERE m."tenantId" = t.id
            AND r.slug = 'owner'
            AND m.status = 'ACTIVE'
        ) AS "ownerCount",
        COUNT(*) OVER()::int AS "totalCount"
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      WHERE ${search.length === 0}
         OR t.name ILIKE ${searchPattern}
         OR t.slug ILIKE ${searchPattern}
      ORDER BY t."createdAt" DESC, t.id ASC
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

  async getTenant360(tenantId: string) {
    const [tenant] = await this.prisma.$queryRaw<TenantOverviewRow[]>`
      SELECT
        t.id,
        t.name,
        t.slug,
        t."createdAt",
        t."updatedAt",
        COALESCE(ptl.state, 'ACTIVE')::text AS "lifecycleState",
        ptl.reason AS "lifecycleReason",
        COALESCE(ptl.version, 0)::int AS "lifecycleVersion",
        ptl.updated_at AS "lifecycleUpdatedAt",
        (
          SELECT COUNT(*)::int FROM companies c
          WHERE c."tenantId" = t.id
        ) AS "companyCount",
        (
          SELECT COUNT(*)::int FROM companies c
          WHERE c."tenantId" = t.id AND c.status = 'ACTIVE'
        ) AS "activeCompanyCount",
        (
          SELECT COUNT(*)::int
          FROM branches b
          INNER JOIN companies c ON c.id = b."companyId"
          WHERE c."tenantId" = t.id
        ) AS "branchCount",
        (
          SELECT COUNT(*)::int
          FROM branches b
          INNER JOIN companies c ON c.id = b."companyId"
          WHERE c."tenantId" = t.id AND b.status = 'ACTIVE'
        ) AS "activeBranchCount",
        (
          SELECT COUNT(*)::int FROM memberships m
          WHERE m."tenantId" = t.id AND m.status = 'ACTIVE'
        ) AS "activeMembershipCount",
        (
          SELECT COUNT(*)::int
          FROM memberships m
          INNER JOIN roles r ON r.id = m."roleId"
          WHERE m."tenantId" = t.id
            AND r.slug = 'owner'
            AND m.status = 'ACTIVE'
        ) AS "ownerCount"
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      WHERE t.id = ${tenantId}
      LIMIT 1
    `;

    if (!tenant) {
      throw new NotFoundException('Platform customer tenant was not found.');
    }

    const companies = await this.prisma.$queryRaw<CompanyRow[]>`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.status::text AS status,
        c."createdAt",
        c."updatedAt",
        (SELECT COUNT(*)::int FROM branches b WHERE b."companyId" = c.id) AS "branchCount",
        (
          SELECT COUNT(*)::int FROM branches b
          WHERE b."companyId" = c.id AND b.status = 'ACTIVE'
        ) AS "activeBranchCount"
      FROM companies c
      WHERE c."tenantId" = ${tenantId}
      ORDER BY c."createdAt" ASC, c.id ASC
    `;

    const membershipBreakdown = await this.prisma.$queryRaw<MembershipBreakdownRow[]>`
      SELECT
        r.slug AS role,
        m.status::text AS status,
        COUNT(*)::int AS count
      FROM memberships m
      INNER JOIN roles r ON r.id = m."roleId"
      WHERE m."tenantId" = ${tenantId}
      GROUP BY r.slug, m.status
      ORDER BY r.slug ASC, m.status::text ASC
    `;

    return {
      tenant,
      companies,
      membershipBreakdown,
    };
  }

  private clampInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (!Number.isInteger(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, value as number));
  }
}