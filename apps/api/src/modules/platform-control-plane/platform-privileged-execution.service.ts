import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { redactPlatformAuditPayload } from '../platform-audit/platform-audit.service';
import type { PlatformOperationContext } from './platform-request-context';

type ExecutionInput = {
  actorUserId: string;
  requestId: string;
  context: PlatformOperationContext;
};

type ApprovalRequest = {
  id: string;
  requesterUserId: string;
  resource: string;
  action: string;
  riskLevel: string;
  status: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  targetTenantId: string | null;
  reason: string;
  payload: unknown;
  expiresAt: Date;
};

type AdminSnapshot = { userId: string; status: string; roles: string[] };
type TxClient = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

@Injectable()
export class PlatformPrivilegedExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: ExecutionInput) {
    const actorUserId = this.required(input.actorUserId, 'actorUserId');
    const requestId = this.required(input.requestId, 'requestId');

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveOwner(tx, actorUserId);
      const request = await this.lockRequest(tx, requestId);

      if (request.status !== 'APPROVED') {
        throw new BadRequestException('Only approved privileged operations can be executed.');
      }
      if (request.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`
          UPDATE platform_privileged_action_requests
          SET status = 'EXPIRED', decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP)
          WHERE id = ${requestId}
        `;
        return { id: requestId, status: 'EXPIRED' as const };
      }
      if (request.resource !== 'platform_iam') {
        throw new BadRequestException('This privileged operation resource is not executable yet.');
      }

      const result = await this.executePlatformIam(tx, actorUserId, request);

      const updated = await tx.$executeRaw`
        UPDATE platform_privileged_action_requests
        SET status = 'EXECUTED', executed_at = CURRENT_TIMESTAMP
        WHERE id = ${requestId} AND status = 'APPROVED'
      `;
      if (updated !== 1) {
        throw new BadRequestException('Privileged operation was already consumed.');
      }

      await this.auditExecution(tx, actorUserId, request, input.context, result.before, result.after);
      return { id: requestId, status: 'EXECUTED' as const, result: result.after };
    });
  }

  private async executePlatformIam(client: TxClient, actorUserId: string, request: ApprovalRequest) {
    const payload = this.payloadObject(request.payload);
    this.assertTargetBinding(request, payload);

    switch (request.action) {
      case 'admin.provision': {
        const userId = this.requiredString(payload.userId, 'payload.userId');
        const roleSlug = this.optionalString(payload.roleSlug);
        await this.assertUserExists(client, userId);
        if (roleSlug) await this.assertRoleExists(client, roleSlug);
        const before = await this.snapshotAdmin(client, userId);
        await client.$executeRaw`
          INSERT INTO platform_admin_users (user_id, status)
          VALUES (${userId}, 'ACTIVE')
          ON CONFLICT (user_id)
          DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
        `;
        if (roleSlug) {
          await client.$executeRaw`
            INSERT INTO platform_admin_user_roles (user_id, role_slug)
            VALUES (${userId}, ${roleSlug})
            ON CONFLICT (user_id, role_slug) DO NOTHING
          `;
        }
        return { before, after: await this.requireAdmin(client, userId) };
      }
      case 'admin.suspend': {
        const userId = this.requiredString(payload.userId, 'payload.userId');
        if (userId === actorUserId) {
          throw new ForbiddenException('Executor cannot suspend their own platform account.');
        }
        const before = await this.requireAdmin(client, userId);
        if (before.roles.includes('PLATFORM_OWNER')) await this.assertAnotherActiveOwner(client, userId);
        await client.$executeRaw`
          UPDATE platform_admin_users
          SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ${userId}
        `;
        return { before, after: await this.requireAdmin(client, userId) };
      }
      case 'role.assign': {
        const userId = this.requiredString(payload.userId, 'payload.userId');
        const roleSlug = this.requiredString(payload.roleSlug, 'payload.roleSlug');
        const before = await this.requireAdmin(client, userId);
        await this.assertRoleExists(client, roleSlug);
        await client.$executeRaw`
          INSERT INTO platform_admin_user_roles (user_id, role_slug)
          VALUES (${userId}, ${roleSlug})
          ON CONFLICT (user_id, role_slug) DO NOTHING
        `;
        return { before, after: await this.requireAdmin(client, userId) };
      }
      case 'role.remove': {
        const userId = this.requiredString(payload.userId, 'payload.userId');
        const roleSlug = this.requiredString(payload.roleSlug, 'payload.roleSlug');
        if (userId === actorUserId) {
          throw new ForbiddenException('Executor cannot remove their own platform role.');
        }
        const before = await this.requireAdmin(client, userId);
        if (roleSlug === 'PLATFORM_OWNER' && before.status === 'ACTIVE') {
          await this.assertAnotherActiveOwner(client, userId);
        }
        await client.$executeRaw`
          DELETE FROM platform_admin_user_roles
          WHERE user_id = ${userId} AND role_slug = ${roleSlug}
        `;
        return { before, after: await this.requireAdmin(client, userId) };
      }
      case 'permission.grant':
      case 'permission.revoke': {
        const roleSlug = this.requiredString(payload.roleSlug, 'payload.roleSlug');
        const resource = this.requiredString(payload.resource, 'payload.resource');
        const action = this.requiredString(payload.action, 'payload.action');
        await this.assertRoleExists(client, roleSlug);
        await this.assertPermissionExists(client, resource, action);
        if (
          request.action === 'permission.revoke' &&
          roleSlug === 'PLATFORM_OWNER' &&
          resource === 'platform_iam' &&
          action === 'manage'
        ) {
          throw new ForbiddenException('PLATFORM_OWNER must retain platform_iam.manage.');
        }
        const before = await this.rolePermissions(client, roleSlug);
        if (request.action === 'permission.grant') {
          await client.$executeRaw`
            INSERT INTO platform_role_permissions (role_slug, resource, action)
            VALUES (${roleSlug}, ${resource}, ${action})
            ON CONFLICT (role_slug, resource, action) DO NOTHING
          `;
        } else {
          await client.$executeRaw`
            DELETE FROM platform_role_permissions
            WHERE role_slug = ${roleSlug} AND resource = ${resource} AND action = ${action}
          `;
        }
        return { before, after: await this.rolePermissions(client, roleSlug) };
      }
      default:
        throw new BadRequestException('Unsupported platform IAM privileged action.');
    }
  }

  private assertTargetBinding(request: ApprovalRequest, payload: Record<string, unknown>) {
    if (request.action === 'admin.provision' || request.action === 'admin.suspend' || request.action === 'role.assign' || request.action === 'role.remove') {
      const userId = this.requiredString(payload.userId, 'payload.userId');
      if (request.targetEntityType !== 'platform_admin_user' || request.targetEntityId !== userId) {
        throw new BadRequestException('Approved target does not match the stored platform admin payload.');
      }
      return;
    }

    if (request.action === 'permission.grant' || request.action === 'permission.revoke') {
      const roleSlug = this.requiredString(payload.roleSlug, 'payload.roleSlug');
      if (request.targetEntityType !== 'platform_role' || request.targetEntityId !== roleSlug) {
        throw new BadRequestException('Approved target does not match the stored platform role payload.');
      }
    }
  }

  private async lockRequest(client: TxClient, requestId: string) {
    const rows = await client.$queryRaw<ApprovalRequest[]>`
      SELECT
        id,
        requester_user_id AS "requesterUserId",
        resource,
        action,
        risk_level AS "riskLevel",
        status,
        target_entity_type AS "targetEntityType",
        target_entity_id AS "targetEntityId",
        target_tenant_id AS "targetTenantId",
        reason,
        payload,
        expires_at AS "expiresAt"
      FROM platform_privileged_action_requests
      WHERE id = ${requestId}
      FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException('Privileged operation request was not found.');
    return rows[0];
  }

  private async auditExecution(
    client: TxClient,
    actorUserId: string,
    request: ApprovalRequest,
    context: PlatformOperationContext,
    beforeState: unknown,
    afterState: unknown,
  ) {
    const before = JSON.stringify(redactPlatformAuditPayload(beforeState ?? null));
    const after = JSON.stringify(redactPlatformAuditPayload(afterState ?? null));
    const metadata = JSON.stringify({ requesterUserId: request.requesterUserId });
    await client.$queryRaw`
      INSERT INTO platform_audit_events (
        actor_user_id, resource, action, target_entity_type, target_entity_id,
        target_tenant_id, reason, before_state, after_state, metadata,
        request_id, source_ip, user_agent, risk_level, approval_request_id
      ) VALUES (
        ${actorUserId}, ${request.resource}, ${request.action}, ${request.targetEntityType},
        ${request.targetEntityId}, ${request.targetTenantId}, ${request.reason},
        ${before}::jsonb, ${after}::jsonb, ${metadata}::jsonb,
        ${context.requestId}, ${context.sourceIp}, ${context.userAgent},
        ${request.riskLevel}, ${request.id}
      )
      RETURNING id
    `;
  }

  private async snapshotAdmin(client: TxClient, userId: string): Promise<AdminSnapshot | null> {
    const rows = await client.$queryRaw<AdminSnapshot[]>`
      SELECT pau.user_id AS "userId", pau.status,
        COALESCE(ARRAY_AGG(paur.role_slug ORDER BY paur.role_slug)
          FILTER (WHERE paur.role_slug IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM platform_admin_users pau
      LEFT JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.user_id = ${userId}
      GROUP BY pau.user_id, pau.status
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async requireAdmin(client: TxClient, userId: string) {
    const admin = await this.snapshotAdmin(client, userId);
    if (!admin) throw new NotFoundException('Platform administrator was not found.');
    return admin;
  }

  private async assertUserExists(client: TxClient, userId: string) {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Platform admin target user was not found.');
  }

  private async assertRoleExists(client: TxClient, roleSlug: string) {
    const rows = await client.$queryRaw<Array<{ slug: string }>>`
      SELECT slug FROM platform_roles WHERE slug = ${roleSlug} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Platform role was not found.');
  }

  private async assertPermissionExists(client: TxClient, resource: string, action: string) {
    const rows = await client.$queryRaw<Array<{ resource: string }>>`
      SELECT resource FROM platform_permissions
      WHERE resource = ${resource} AND action = ${action}
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Platform permission was not found.');
  }

  private async assertActiveOwner(client: TxClient, userId: string) {
    const rows = await client.$queryRaw<Array<{ userId: string }>>`
      SELECT pau.user_id AS "userId"
      FROM platform_admin_users pau
      INNER JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.user_id = ${userId} AND pau.status = 'ACTIVE'
        AND paur.role_slug = 'PLATFORM_OWNER'
      LIMIT 1
    `;
    if (!rows.length) throw new ForbiddenException('Active PLATFORM_OWNER authority is required.');
  }

  private async assertAnotherActiveOwner(client: TxClient, excludedUserId: string) {
    const rows = await client.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT pau.user_id)::int AS count
      FROM platform_admin_users pau
      INNER JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.status = 'ACTIVE' AND paur.role_slug = 'PLATFORM_OWNER'
        AND pau.user_id <> ${excludedUserId}
    `;
    if ((rows[0]?.count ?? 0) < 1) {
      throw new BadRequestException('The last active PLATFORM_OWNER cannot be suspended or demoted.');
    }
  }

  private async rolePermissions(client: TxClient, roleSlug: string) {
    return client.$queryRaw<Array<{ resource: string; action: string }>>`
      SELECT resource, action FROM platform_role_permissions
      WHERE role_slug = ${roleSlug}
      ORDER BY resource ASC, action ASC
    `;
  }

  private payloadObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Privileged operation payload is invalid.');
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private required(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} is required.`);
    return normalized;
  }
}
