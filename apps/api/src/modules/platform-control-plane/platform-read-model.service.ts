import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

type CommandCenterCounts = {
  tenantCount: number;
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
        activeMembershipCount: number;
        activeBranchCount: number;
      }>
    >`
      SELECT
        t.id,
        t.name,
        t.slug,
        t."createdAt",
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
      ORDER BY t."createdAt" DESC, t.id ASC
      LIMIT 5
    `;

    return {
      counts: counts ?? {
        tenantCount: 0,
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
          SELECT COUNT(*)::int FROM memberships m
          WHERE m."tenantId" = t.id
            AND m.role = 'OWNER'
            AND m.status = 'ACTIVE'
        ) AS "ownerCount",
        COUNT(*) OVER()::int AS "totalCount"
      FROM tenants t
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
          SELECT COUNT(*)::int FROM memberships m
          WHERE m."tenantId" = t.id
            AND m.role = 'OWNER'
            AND m.status = 'ACTIVE'
        ) AS "ownerCount"
      FROM tenants t
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

    const membershipBreakdown = await this.prisma.$queryRaw<
      MembershipBreakdownRow[]
    >`
      SELECT
        m.role::text AS role,
        m.status::text AS status,
        COUNT(*)::int AS count
      FROM memberships m
      WHERE m."tenantId" = ${tenantId}
      GROUP BY m.role, m.status
      ORDER BY m.role::text ASC, m.status::text ASC
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
