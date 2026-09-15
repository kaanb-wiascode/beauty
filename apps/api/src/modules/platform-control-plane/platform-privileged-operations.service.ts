import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { redactPlatformAuditPayload } from '../platform-audit/platform-audit.service';
import type { PlatformOperationContext } from './platform-request-context';

export type PrivilegedRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type CreatePrivilegedRequestInput = {
  actorUserId: string;
  resource: string;
  action: string;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  targetTenantId?: string | null;
  reason: string;
  payload?: unknown;
  context: PlatformOperationContext;
};

type DecidePrivilegedRequestInput = {
  actorUserId: string;
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
  context: PlatformOperationContext;
};

const RISK_MAP: Record<string, PrivilegedRiskLevel> = {
  'platform_iam.admin.provision': 'HIGH',
  'platform_iam.admin.suspend': 'HIGH',
  'platform_iam.admin.activate': 'MEDIUM',
  'platform_iam.role.assign': 'HIGH',
  'platform_iam.role.remove': 'HIGH',
  'platform_iam.permission.grant': 'CRITICAL',
  'platform_iam.permission.revoke': 'CRITICAL',
};

@Injectable()
export class PlatformPrivilegedOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePrivilegedRequestInput) {
    const actorUserId = this.required(input.actorUserId, 'actorUserId');
    const resource = this.required(input.resource, 'resource');
    const action = this.required(input.action, 'action');
    const reason = this.reason(input.reason);
    const riskLevel = RISK_MAP[`${resource}.${action}`] ?? 'HIGH';
    const payload = JSON.stringify(redactPlatformAuditPayload(input.payload ?? {}));

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; createdAt: Date; expiresAt: Date }>>`
        INSERT INTO platform_privileged_action_requests (
          requester_user_id, resource, action, risk_level, target_entity_type,
          target_entity_id, target_tenant_id, reason, payload, request_id,
          source_ip, user_agent
        ) VALUES (
          ${actorUserId}, ${resource}, ${action}, ${riskLevel},
          ${input.targetEntityType ?? null}, ${input.targetEntityId ?? null},
          ${input.targetTenantId ?? null}, ${reason}, ${payload}::jsonb,
          ${input.context.requestId}, ${input.context.sourceIp}, ${input.context.userAgent}
        )
        RETURNING id, created_at AS "createdAt", expires_at AS "expiresAt"
      `;

      const created = rows[0];
      if (!created) throw new BadRequestException('Privileged operation request could not be created.');

      await tx.$queryRaw`
        INSERT INTO platform_audit_events (
          actor_user_id, resource, action, target_entity_type, target_entity_id,
          target_tenant_id, reason, metadata, request_id, source_ip, user_agent,
          risk_level, approval_request_id
        ) VALUES (
          ${actorUserId}, 'privileged_operations', 'request.create',
          'platform_privileged_action_request', ${created.id}, ${input.targetTenantId ?? null},
          ${reason}, ${JSON.stringify({ resource, action, riskLevel })}::jsonb,
          ${input.context.requestId}, ${input.context.sourceIp}, ${input.context.userAgent},
          ${riskLevel}, ${created.id}
        )
        RETURNING id
      `;

      return { ...created, riskLevel };
    });
  }

  async decide(input: DecidePrivilegedRequestInput) {
    const actorUserId = this.required(input.actorUserId, 'actorUserId');
    const requestId = this.required(input.requestId, 'requestId');
    const decisionReason = this.reason(input.reason);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveOwner(tx, actorUserId);
      const requests = await tx.$queryRaw<Array<{
        id: string;
        requesterUserId: string;
        resource: string;
        action: string;
        riskLevel: PrivilegedRiskLevel;
        status: string;
        targetTenantId: string | null;
        expiresAt: Date;
      }>>`
        SELECT
          id,
          requester_user_id AS "requesterUserId",
          resource,
          action,
          risk_level AS "riskLevel",
          status,
          target_tenant_id AS "targetTenantId",
          expires_at AS "expiresAt"
        FROM platform_privileged_action_requests
        WHERE id = ${requestId}
        FOR UPDATE
      `;
      const request = requests[0];
      if (!request) throw new NotFoundException('Privileged operation request was not found.');
      if (request.requesterUserId === actorUserId) {
        throw new ForbiddenException('Requester cannot approve or reject their own privileged operation.');
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException('Privileged operation request is no longer pending.');
      }
      if (request.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`
          UPDATE platform_privileged_action_requests
          SET status = 'EXPIRED', decided_at = CURRENT_TIMESTAMP,
              decision_reason = 'Approval window expired.'
          WHERE id = ${requestId}
        `;
        await tx.$queryRaw`
          INSERT INTO platform_audit_events (
            actor_user_id, resource, action, target_entity_type, target_entity_id,
            target_tenant_id, reason, metadata, request_id, source_ip, user_agent,
            risk_level, approval_request_id
          ) VALUES (
            ${actorUserId}, 'privileged_operations', 'request.expire',
            'platform_privileged_action_request', ${requestId}, ${request.targetTenantId},
            'Approval window expired.', ${JSON.stringify({ resource: request.resource, action: request.action })}::jsonb,
            ${input.context.requestId}, ${input.context.sourceIp}, ${input.context.userAgent},
            ${request.riskLevel}, ${requestId}
          )
          RETURNING id
        `;
        return { id: requestId, status: 'EXPIRED' as const };
      }

      await tx.$executeRaw`
        UPDATE platform_privileged_action_requests
        SET status = ${input.decision}, approver_user_id = ${actorUserId},
            decision_reason = ${decisionReason}, decided_at = CURRENT_TIMESTAMP
        WHERE id = ${requestId}
      `;

      await tx.$queryRaw`
        INSERT INTO platform_audit_events (
          actor_user_id, resource, action, target_entity_type, target_entity_id,
          target_tenant_id, reason, metadata, request_id, source_ip, user_agent,
          risk_level, approval_request_id
        ) VALUES (
          ${actorUserId}, 'privileged_operations', ${input.decision === 'APPROVED' ? 'request.approve' : 'request.reject'},
          'platform_privileged_action_request', ${requestId}, ${request.targetTenantId},
          ${decisionReason}, ${JSON.stringify({ resource: request.resource, action: request.action })}::jsonb,
          ${input.context.requestId}, ${input.context.sourceIp}, ${input.context.userAgent},
          ${request.riskLevel}, ${requestId}
        )
        RETURNING id
      `;

      return { id: requestId, status: input.decision };
    });
  }

  async list(input: { status?: string; limit?: number; offset?: number }) {
    const status = input.status?.trim().toUpperCase() || null;
    const limit = this.clamp(input.limit, 25, 1, 100);
    const offset = this.clamp(input.offset, 0, 0, 100_000);
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      requesterUserId: string;
      requesterEmail: string;
      approverUserId: string | null;
      approverEmail: string | null;
      resource: string;
      action: string;
      riskLevel: PrivilegedRiskLevel;
      status: string;
      targetEntityType: string | null;
      targetEntityId: string | null;
      targetTenantId: string | null;
      reason: string;
      decisionReason: string | null;
      createdAt: Date;
      decidedAt: Date | null;
      executedAt: Date | null;
      expiresAt: Date;
      totalCount: number;
    }>>`
      SELECT
        r.id,
        r.requester_user_id AS "requesterUserId",
        requester.email AS "requesterEmail",
        r.approver_user_id AS "approverUserId",
        approver.email AS "approverEmail",
        r.resource,
        r.action,
        r.risk_level AS "riskLevel",
        r.status,
        r.target_entity_type AS "targetEntityType",
        r.target_entity_id AS "targetEntityId",
        r.target_tenant_id AS "targetTenantId",
        r.reason,
        r.decision_reason AS "decisionReason",
        r.created_at AS "createdAt",
        r.decided_at AS "decidedAt",
        r.executed_at AS "executedAt",
        r.expires_at AS "expiresAt",
        COUNT(*) OVER()::int AS "totalCount"
      FROM platform_privileged_action_requests r
      INNER JOIN users requester ON requester.id = r.requester_user_id
      LEFT JOIN users approver ON approver.id = r.approver_user_id
      WHERE ${status}::text IS NULL OR r.status = ${status}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return {
      items: rows.map(({ totalCount: _totalCount, ...row }) => row),
      pagination: { total: rows[0]?.totalCount ?? 0, limit, offset },
    };
  }

  private async assertActiveOwner(client: Pick<PrismaService, '$queryRaw'>, userId: string) {
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

  private required(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} is required.`);
    return normalized;
  }

  private reason(value: string) {
    const normalized = value.trim();
    if (normalized.length < 8 || normalized.length > 500) {
      throw new BadRequestException('A reason between 8 and 500 characters is required.');
    }
    return normalized;
  }

  private clamp(value: number | undefined, fallback: number, min: number, max: number) {
    if (!Number.isInteger(value)) return fallback;
    return Math.min(max, Math.max(min, value as number));
  }
}
