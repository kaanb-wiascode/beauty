import { Injectable } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

type PlatformAdminRow = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{ slug: string; name: string }>;
};

type PlatformRoleRow = {
  slug: string;
  name: string;
  description: string | null;
  system: boolean;
  userCount: number;
  permissions: Array<{ resource: string; action: string; description: string | null }>;
};

type PlatformPermissionRow = {
  resource: string;
  action: string;
  description: string | null;
  roleCount: number;
};

@Injectable()
export class PlatformIamReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const admins = await this.prisma.$queryRaw<PlatformAdminRow[]>`
      SELECT
        pau.user_id AS "userId",
        u.email,
        u."firstName",
        u."lastName",
        pau.status,
        pau.created_at AS "createdAt",
        pau.updated_at AS "updatedAt",
        COALESCE(
          jsonb_agg(
            jsonb_build_object('slug', pr.slug, 'name', pr.name)
            ORDER BY pr.slug
          ) FILTER (WHERE pr.slug IS NOT NULL),
          '[]'::jsonb
        ) AS roles
      FROM platform_admin_users pau
      INNER JOIN users u ON u.id = pau.user_id
      LEFT JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      LEFT JOIN platform_roles pr ON pr.slug = paur.role_slug
      GROUP BY pau.user_id, u.email, u."firstName", u."lastName", pau.status, pau.created_at, pau.updated_at
      ORDER BY u."firstName" ASC, u."lastName" ASC, u.email ASC
    `;

    const roles = await this.prisma.$queryRaw<PlatformRoleRow[]>`
      SELECT
        pr.slug,
        pr.name,
        pr.description,
        pr.system,
        (
          SELECT COUNT(*)::int
          FROM platform_admin_user_roles paur
          WHERE paur.role_slug = pr.slug
        ) AS "userCount",
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'resource', pp.resource,
                'action', pp.action,
                'description', pp.description
              ) ORDER BY pp.resource, pp.action
            )
            FROM platform_role_permissions prp
            INNER JOIN platform_permissions pp
              ON pp.resource = prp.resource
             AND pp.action = prp.action
            WHERE prp.role_slug = pr.slug
          ),
          '[]'::jsonb
        ) AS permissions
      FROM platform_roles pr
      ORDER BY pr.slug ASC
    `;

    const permissions = await this.prisma.$queryRaw<PlatformPermissionRow[]>`
      SELECT
        pp.resource,
        pp.action,
        pp.description,
        COUNT(prp.role_slug)::int AS "roleCount"
      FROM platform_permissions pp
      LEFT JOIN platform_role_permissions prp
        ON prp.resource = pp.resource
       AND prp.action = pp.action
      GROUP BY pp.resource, pp.action, pp.description
      ORDER BY pp.resource ASC, pp.action ASC
    `;

    return {
      summary: {
        adminCount: admins.length,
        activeAdminCount: admins.filter((admin) => admin.status === 'ACTIVE').length,
        roleCount: roles.length,
        permissionCount: permissions.length,
      },
      admins,
      roles,
      permissions,
    };
  }
}
