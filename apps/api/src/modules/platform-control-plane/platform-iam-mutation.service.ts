import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { redactPlatformAuditPayload } from '../platform-audit/platform-audit.service';

type MutationContext = {
  actorUserId: string;
  reason: string;
};

type AdminSnapshot = {
  userId: string;
  status: string;
  roles: string[];
};

type QueryClient = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

@Injectable()
export class PlatformIamMutationService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionAdmin(
    context: MutationContext,
    input: { userId: string; roleSlug?: string },
  ) {
    const actorUserId = this.required(context.actorUserId, 'actorUserId');
    const reason = this.reason(context.reason);
    const userId = this.required(input.userId, 'userId');
    const roleSlug = input.roleSlug?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ id: string; email: string }>>`
        SELECT id, email FROM users WHERE id = ${userId} LIMIT 1
      `;
      if (!users.length) {
        throw new NotFoundException('Platform admin target user was not found.');
      }

      if (roleSlug) {
        await this.assertRoleExists(tx, roleSlug);
      }

      const before = await this.snapshotAdmin(tx, userId);

      await tx.$executeRaw`
        INSERT INTO platform_admin_users (user_id, status)
        VALUES (${userId}, 'ACTIVE')
        ON CONFLICT (user_id)
        DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
      `;

      if (roleSlug) {
        await tx.$executeRaw`
          INSERT INTO platform_admin_user_roles (user_id, role_slug)
          VALUES (${userId}, ${roleSlug})
          ON CONFLICT (user_id, role_slug) DO NOTHING
        `;
      }

      const after = await this.snapshotAdmin(tx, userId);
      await this.audit(tx, {
        actorUserId,
        action: 'admin.provision',
        targetEntityType: 'platform_admin_user',
        targetEntityId: userId,
        reason,
        beforeState: before,
        afterState: after,
      });

      return after;
    });
  }

  async setAdminStatus(
    context: MutationContext,
    input: { userId: string; status: string },
  ) {
    const actorUserId = this.required(context.actorUserId, 'actorUserId');
    const reason = this.reason(context.reason);
    const userId = this.required(input.userId, 'userId');
    const status = input.status.trim().toUpperCase();

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      throw new BadRequestException('Platform admin status must be ACTIVE or SUSPENDED.');
    }
    if (actorUserId === userId && status === 'SUSPENDED') {
      throw new BadRequestException('A platform administrator cannot suspend their own account.');
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireAdmin(tx, userId);
      if (status === 'SUSPENDED' && before.roles.includes('PLATFORM_OWNER')) {
        await this.assertAnotherActiveOwner(tx, userId);
      }

      await tx.$executeRaw`
        UPDATE platform_admin_users
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
      `;

      const after = await this.requireAdmin(tx, userId);
      await this.audit(tx, {
        actorUserId,
        action: status === 'ACTIVE' ? 'admin.activate' : 'admin.suspend',
        targetEntityType: 'platform_admin_user',
        targetEntityId: userId,
        reason,
        beforeState: before,
        afterState: after,
      });
      return after;
    });
  }

  async assignRole(
    context: MutationContext,
    input: { userId: string; roleSlug: string },
  ) {
    const actorUserId = this.required(context.actorUserId, 'actorUserId');
    const reason = this.reason(context.reason);
    const userId = this.required(input.userId, 'userId');
    const roleSlug = this.required(input.roleSlug, 'roleSlug');

    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireAdmin(tx, userId);
      await this.assertRoleExists(tx, roleSlug);

      await tx.$executeRaw`
        INSERT INTO platform_admin_user_roles (user_id, role_slug)
        VALUES (${userId}, ${roleSlug})
        ON CONFLICT (user_id, role_slug) DO NOTHING
      `;

      const after = await this.requireAdmin(tx, userId);
      await this.audit(tx, {
        actorUserId,
        action: 'role.assign',
        targetEntityType: 'platform_admin_user',
        targetEntityId: userId,
        reason,
        beforeState: before,
        afterState: after,
        metadata: { roleSlug },
      });
      return after;
    });
  }

  async removeRole(
    context: MutationContext,
    input: { userId: string; roleSlug: string },
  ) {
    const actorUserId = this.required(context.actorUserId, 'actorUserId');
    const reason = this.reason(context.reason);
    const userId = this.required(input.userId, 'userId');
    const roleSlug = this.required(input.roleSlug, 'roleSlug');

    if (actorUserId === userId) {
      throw new BadRequestException('A platform administrator cannot remove their own platform role.');
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireAdmin(tx, userId);
      if (roleSlug === 'PLATFORM_OWNER' && before.status === 'ACTIVE') {
        await this.assertAnotherActiveOwner(tx, userId);
      }

      await tx.$executeRaw`
        DELETE FROM platform_admin_user_roles
        WHERE user_id = ${userId} AND role_slug = ${roleSlug}
      `;

      const after = await this.requireAdmin(tx, userId);
      await this.audit(tx, {
        actorUserId,
        action: 'role.remove',
        targetEntityType: 'platform_admin_user',
        targetEntityId: userId,
        reason,
        beforeState: before,
        afterState: after,
        metadata: { roleSlug },
      });
      return after;
    });
  }

  async grantRolePermission(
    context: MutationContext,
    input: { roleSlug: string; resource: string; action: string },
  ) {
    return this.changeRolePermission(context, input, true);
  }

  async revokeRolePermission(
    context: MutationContext,
    input: { roleSlug: string; resource: string; action: string },
  ) {
    return this.changeRolePermission(context, input, false);
  }

  private async changeRolePermission(
    context: MutationContext,
    input: { roleSlug: string; resource: string; action: string },
    grant: boolean,
  ) {
    const actorUserId = this.required(context.actorUserId, 'actorUserId');
    const reason = this.reason(context.reason);
    const roleSlug = this.required(input.roleSlug, 'roleSlug');
    const resource = this.required(input.resource, 'resource');
    const action = this.required(input.action, 'action');

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveOwner(tx, actorUserId);
      await this.assertRoleExists(tx, roleSlug);
      await this.assertPermissionExists(tx, resource, action);

      if (
        !grant &&
        roleSlug === 'PLATFORM_OWNER' &&
        resource === 'platform_iam' &&
        action === 'manage'
      ) {
        throw new ForbiddenException('PLATFORM_OWNER must retain platform_iam.manage.');
      }

      const before = await this.rolePermissions(tx, roleSlug);
      if (grant) {
        await tx.$executeRaw`
          INSERT INTO platform_role_permissions (role_slug, resource, action)
          VALUES (${roleSlug}, ${resource}, ${action})
          ON CONFLICT (role_slug, resource, action) DO NOTHING
        `;
      } else {
        await tx.$executeRaw`
          DELETE FROM platform_role_permissions
          WHERE role_slug = ${roleSlug}
            AND resource = ${resource}
            AND action = ${action}
        `;
      }
      const after = await this.rolePermissions(tx, roleSlug);

      await this.audit(tx, {
        actorUserId,
        action: grant ? 'permission.grant' : 'permission.revoke',
        targetEntityType: 'platform_role',
        targetEntityId: roleSlug,
        reason,
        beforeState: before,
        afterState: after,
        metadata: { resource, action },
      });
      return { roleSlug, permissions: after };
    });
  }

  private async snapshotAdmin(client: QueryClient, userId: string): Promise<AdminSnapshot | null> {
    const rows = await client.$queryRaw<AdminSnapshot[]>`
      SELECT
        pau.user_id AS "userId",
        pau.status,
        COALESCE(
          ARRAY_AGG(paur.role_slug ORDER BY paur.role_slug)
          FILTER (WHERE paur.role_slug IS NOT NULL),
          ARRAY[]::text[]
        ) AS roles
      FROM platform_admin_users pau
      LEFT JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.user_id = ${userId}
      GROUP BY pau.user_id, pau.status
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async requireAdmin(client: QueryClient, userId: string) {
    const admin = await this.snapshotAdmin(client, userId);
    if (!admin) {
      throw new NotFoundException('Platform administrator was not found.');
    }
    return admin;
  }

  private async assertRoleExists(client: QueryClient, roleSlug: string) {
    const rows = await client.$queryRaw<Array<{ slug: string }>>`
      SELECT slug FROM platform_roles WHERE slug = ${roleSlug} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Platform role was not found.');
  }

  private async assertPermissionExists(client: QueryClient, resource: string, action: string) {
    const rows = await client.$queryRaw<Array<{ resource: string }>>`
      SELECT resource FROM platform_permissions
      WHERE resource = ${resource} AND action = ${action}
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Platform permission was not found.');
  }

  private async assertActiveOwner(client: QueryClient, userId: string) {
    const rows = await client.$queryRaw<Array<{ userId: string }>>`
      SELECT pau.user_id AS "userId"
      FROM platform_admin_users pau
      INNER JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.user_id = ${userId}
        AND pau.status = 'ACTIVE'
        AND paur.role_slug = 'PLATFORM_OWNER'
      LIMIT 1
    `;
    if (!rows.length) throw new ForbiddenException('Active PLATFORM_OWNER authority is required.');
  }

  private async assertAnotherActiveOwner(client: QueryClient, excludedUserId: string) {
    const rows = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT pau.user_id)::int AS count
      FROM platform_admin_users pau
      INNER JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.status = 'ACTIVE'
        AND paur.role_slug = 'PLATFORM_OWNER'
        AND pau.user_id <> ${excludedUserId}
    `;
    if ((rows[0]?.count ?? 0) < 1) {
      throw new BadRequestException('The last active PLATFORM_OWNER cannot be suspended or demoted.');
    }
  }

  private async rolePermissions(client: QueryClient, roleSlug: string) {
    return client.$queryRaw<Array<{ resource: string; action: string }>>`
      SELECT resource, action
      FROM platform_role_permissions
      WHERE role_slug = ${roleSlug}
      ORDER BY resource ASC, action ASC
    `;
  }

  private async audit(
    client: QueryClient,
    input: {
      actorUserId: string;
      action: string;
      targetEntityType: string;
      targetEntityId: string;
      reason: string;
      beforeState?: unknown;
      afterState?: unknown;
      metadata?: unknown;
    },
  ) {
    const beforeState = JSON.stringify(redactPlatformAuditPayload(input.beforeState ?? null));
    const afterState = JSON.stringify(redactPlatformAuditPayload(input.afterState ?? null));
    const metadata = JSON.stringify(redactPlatformAuditPayload(input.metadata ?? {}));

    await client.$queryRaw`
      INSERT INTO platform_audit_events (
        actor_user_id, resource, action, target_entity_type, target_entity_id,
        reason, before_state, after_state, metadata
      ) VALUES (
        ${input.actorUserId}, 'platform_iam', ${input.action}, ${input.targetEntityType},
        ${input.targetEntityId}, ${input.reason}, ${beforeState}::jsonb,
        ${afterState}::jsonb, ${metadata}::jsonb
      )
      RETURNING id
    `;
  }

  private required(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} is required.`);
    return normalized;
  }

  private reason(value: string) {
    const reason = value.trim();
    if (reason.length < 8 || reason.length > 500) {
      throw new BadRequestException('A reason between 8 and 500 characters is required.');
    }
    return reason;
  }
}
