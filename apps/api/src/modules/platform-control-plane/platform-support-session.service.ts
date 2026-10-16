import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PlatformPrivilegedOperationsService } from './platform-privileged-operations.service';
import type { PlatformOperationContext } from './platform-request-context';

const ACCESS_MODES = ['READ_ONLY', 'CONTROLLED_WRITE'] as const;
type AccessMode = (typeof ACCESS_MODES)[number];

type SupportSessionRow = {
  id: string;
  approvalRequestId: string;
  tenantId: string;
  supportTicketId: string | null;
  requesterPlatformUserId: string;
  approverPlatformUserId: string;
  openedByPlatformUserId: string;
  accessMode: AccessMode;
  scopes: unknown;
  reason: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  startedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedByPlatformUserId: string | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ApprovedRequestRow = {
  id: string;
  requesterUserId: string;
  approverUserId: string | null;
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

@Injectable()
export class PlatformSupportSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privileged: PlatformPrivilegedOperationsService,
    private readonly audit: PlatformAuditService,
  ) {}

  async request(
    actorUserId: string,
    input: {
      tenantId?: string;
      supportTicketId?: string | null;
      accessMode?: string;
      scopes?: string[];
      durationMinutes?: number;
      reason?: string;
    },
    context: PlatformOperationContext,
  ) {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('tenantId is required.');
    const accessMode = this.accessMode(input.accessMode ?? 'READ_ONLY');
    const durationMinutes = this.duration(input.durationMinutes ?? 30);
    const scopes = this.scopes(input.scopes, accessMode);
    const supportTicketId = input.supportTicketId?.trim() || null;

    const tenant = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1
    `;
    if (!tenant[0]) throw new NotFoundException('Tenant not found.');

    if (accessMode === 'CONTROLLED_WRITE' && !supportTicketId) {
      throw new BadRequestException(
        'CONTROLLED_WRITE support sessions require an active support ticket.',
      );
    }
    if (supportTicketId) {
      await this.assertTicketEligible(
        this.prisma,
        supportTicketId,
        tenantId,
        accessMode === 'CONTROLLED_WRITE',
      );
    }

    return this.privileged.create({
      actorUserId,
      resource: 'support_session',
      action: 'session.open',
      targetEntityType: 'tenant',
      targetEntityId: tenantId,
      targetTenantId: tenantId,
      reason: input.reason ?? '',
      payload: {
        tenantId,
        supportTicketId,
        accessMode,
        scopes,
        durationMinutes,
      },
      context,
    });
  }

  async openApproved(
    approvalRequestId: string,
    actorUserId: string,
    context: PlatformOperationContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveOwner(tx, actorUserId);
      const requests = await tx.$queryRaw<ApprovedRequestRow[]>`
        SELECT
          id,
          requester_user_id AS "requesterUserId",
          approver_user_id AS "approverUserId",
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
        WHERE id = ${approvalRequestId}
        FOR UPDATE
      `;
      const request = requests[0];
      if (!request) {
        throw new NotFoundException('Privileged operation request was not found.');
      }
      if (request.resource !== 'support_session' || request.action !== 'session.open') {
        throw new BadRequestException('Approval request is not a support session request.');
      }
      if (request.status !== 'APPROVED') {
        throw new BadRequestException('Only approved support session requests can be opened.');
      }
      if (!request.approverUserId) {
        throw new BadRequestException('Support session approval is incomplete.');
      }
      if (request.requesterUserId === request.approverUserId) {
        throw new ForbiddenException('Support session requires independent approval.');
      }
      if (request.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`
          UPDATE platform_privileged_action_requests
          SET status = 'EXPIRED', decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP)
          WHERE id = ${approvalRequestId}
        `;
        throw new ConflictException('Support session approval has expired.');
      }

      const payload = this.payloadObject(request.payload);
      const tenantId = this.requiredString(payload.tenantId, 'payload.tenantId');
      const accessMode = this.accessMode(
        this.requiredString(payload.accessMode, 'payload.accessMode'),
      );
      const durationMinutes = this.duration(
        this.requiredNumber(payload.durationMinutes, 'payload.durationMinutes'),
      );
      const scopes = this.scopes(
        Array.isArray(payload.scopes)
          ? payload.scopes.filter((item): item is string => typeof item === 'string')
          : undefined,
        accessMode,
      );
      const supportTicketId = this.optionalString(payload.supportTicketId);

      if (
        request.targetEntityType !== 'tenant' ||
        request.targetEntityId !== tenantId ||
        request.targetTenantId !== tenantId
      ) {
        throw new BadRequestException(
          'Approved support session target does not match the stored payload.',
        );
      }
      if (accessMode === 'CONTROLLED_WRITE' && !supportTicketId) {
        throw new BadRequestException(
          'CONTROLLED_WRITE support sessions require an active support ticket.',
        );
      }
      if (supportTicketId) {
        await this.assertTicketEligible(
          tx,
          supportTicketId,
          tenantId,
          accessMode === 'CONTROLLED_WRITE',
        );
      }

      const scopeJson = JSON.stringify(scopes);
      const rows = await tx.$queryRaw<SupportSessionRow[]>`
        INSERT INTO platform_support_sessions (
          approval_request_id,
          tenant_id,
          support_ticket_id,
          requester_platform_user_id,
          approver_platform_user_id,
          opened_by_platform_user_id,
          access_mode,
          scopes,
          reason,
          expires_at
        ) VALUES (
          ${approvalRequestId},
          ${tenantId},
          ${supportTicketId},
          ${request.requesterUserId},
          ${request.approverUserId},
          ${actorUserId},
          ${accessMode},
          ${scopeJson}::jsonb,
          ${request.reason},
          CURRENT_TIMESTAMP + (${durationMinutes} * INTERVAL '1 minute')
        )
        RETURNING
          id,
          approval_request_id AS "approvalRequestId",
          tenant_id AS "tenantId",
          support_ticket_id AS "supportTicketId",
          requester_platform_user_id AS "requesterPlatformUserId",
          approver_platform_user_id AS "approverPlatformUserId",
          opened_by_platform_user_id AS "openedByPlatformUserId",
          access_mode AS "accessMode",
          scopes,
          reason,
          status,
          started_at AS "startedAt",
          expires_at AS "expiresAt",
          revoked_at AS "revokedAt",
          revoked_by_platform_user_id AS "revokedByPlatformUserId",
          revoke_reason AS "revokeReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      const session = rows[0];

      const consumed = await tx.$executeRaw`
        UPDATE platform_privileged_action_requests
        SET status = 'EXECUTED', executed_at = CURRENT_TIMESTAMP
        WHERE id = ${approvalRequestId} AND status = 'APPROVED'
      `;
      if (consumed !== 1) {
        throw new ConflictException('Support session approval was already consumed.');
      }

      await this.audit.record(
        {
          actorUserId,
          resource: 'support_session',
          action: 'session.open',
          targetTenantId: tenantId,
          targetEntityType: 'platform_support_session',
          targetEntityId: session.id,
          reason: request.reason,
          afterState: session,
          metadata: {
            approvalRequestId,
            requesterUserId: request.requesterUserId,
            approverUserId: request.approverUserId,
            riskLevel: request.riskLevel,
            accessMode,
            scopes,
          },
          requestId: context.requestId,
          sourceIp: context.sourceIp,
          userAgent: context.userAgent,
          riskLevel: request.riskLevel,
          approvalRequestId,
        },
        tx,
      );
      return session;
    });
  }

  async list(input: {
    tenantId?: string;
    status?: string;
    limit?: number;
  } = {}) {
    await this.expireDue();
    const tenantId = input.tenantId?.trim() || null;
    const status = input.status?.trim().toUpperCase() || null;
    if (status && !['ACTIVE', 'REVOKED', 'EXPIRED'].includes(status)) {
      throw new BadRequestException('Invalid support session status.');
    }
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200.');
    }
    return this.prisma.$queryRaw<SupportSessionRow[]>`
      SELECT
        id,
        approval_request_id AS "approvalRequestId",
        tenant_id AS "tenantId",
        support_ticket_id AS "supportTicketId",
        requester_platform_user_id AS "requesterPlatformUserId",
        approver_platform_user_id AS "approverPlatformUserId",
        opened_by_platform_user_id AS "openedByPlatformUserId",
        access_mode AS "accessMode",
        scopes,
        reason,
        status,
        started_at AS "startedAt",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt",
        revoked_by_platform_user_id AS "revokedByPlatformUserId",
        revoke_reason AS "revokeReason",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_support_sessions
      WHERE (${tenantId}::text IS NULL OR tenant_id = ${tenantId})
        AND (${status}::text IS NULL OR status = ${status})
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `;
  }

  async get(sessionId: string) {
    await this.expireDue();
    const rows = await this.prisma.$queryRaw<SupportSessionRow[]>`
      SELECT
        id,
        approval_request_id AS "approvalRequestId",
        tenant_id AS "tenantId",
        support_ticket_id AS "supportTicketId",
        requester_platform_user_id AS "requesterPlatformUserId",
        approver_platform_user_id AS "approverPlatformUserId",
        opened_by_platform_user_id AS "openedByPlatformUserId",
        access_mode AS "accessMode",
        scopes,
        reason,
        status,
        started_at AS "startedAt",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt",
        revoked_by_platform_user_id AS "revokedByPlatformUserId",
        revoke_reason AS "revokeReason",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_support_sessions
      WHERE id = ${sessionId}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Support session not found.');
    return rows[0];
  }

  async revoke(
    sessionId: string,
    actorUserId: string,
    reason: string,
    correlationId?: string | null,
  ) {
    const normalizedReason = this.reason(reason);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SupportSessionRow[]>`
        SELECT
          id,
          approval_request_id AS "approvalRequestId",
          tenant_id AS "tenantId",
          support_ticket_id AS "supportTicketId",
          requester_platform_user_id AS "requesterPlatformUserId",
          approver_platform_user_id AS "approverPlatformUserId",
          opened_by_platform_user_id AS "openedByPlatformUserId",
          access_mode AS "accessMode",
          scopes,
          reason,
          status,
          started_at AS "startedAt",
          expires_at AS "expiresAt",
          revoked_at AS "revokedAt",
          revoked_by_platform_user_id AS "revokedByPlatformUserId",
          revoke_reason AS "revokeReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM platform_support_sessions
        WHERE id = ${sessionId}
        FOR UPDATE
      `;
      const before = rows[0];
      if (!before) throw new NotFoundException('Support session not found.');
      if (before.status !== 'ACTIVE') {
        throw new ConflictException('Only active support sessions can be revoked.');
      }
      await tx.$executeRaw`
        UPDATE platform_support_sessions
        SET status = 'REVOKED',
            revoked_at = CURRENT_TIMESTAMP,
            revoked_by_platform_user_id = ${actorUserId},
            revoke_reason = ${normalizedReason},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${sessionId} AND status = 'ACTIVE'
      `;
      await this.audit.record(
        {
          actorUserId,
          resource: 'support_session',
          action: 'session.revoke',
          targetTenantId: before.tenantId,
          targetEntityType: 'platform_support_session',
          targetEntityId: sessionId,
          reason: normalizedReason,
          beforeState: before,
          afterState: { status: 'REVOKED' },
          correlationId: correlationId ?? null,
          approvalRequestId: before.approvalRequestId,
        },
        tx,
      );
      return { id: sessionId, status: 'REVOKED' as const };
    });
  }

  async assertActiveSession(input: {
    sessionId: string;
    actorUserId: string;
    tenantId: string;
    requiredScope: string;
    write?: boolean;
  }) {
    await this.expireDue();
    const rows = await this.prisma.$queryRaw<SupportSessionRow[]>`
      SELECT
        id,
        approval_request_id AS "approvalRequestId",
        tenant_id AS "tenantId",
        support_ticket_id AS "supportTicketId",
        requester_platform_user_id AS "requesterPlatformUserId",
        approver_platform_user_id AS "approverPlatformUserId",
        opened_by_platform_user_id AS "openedByPlatformUserId",
        access_mode AS "accessMode",
        scopes,
        reason,
        status,
        started_at AS "startedAt",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt",
        revoked_by_platform_user_id AS "revokedByPlatformUserId",
        revoke_reason AS "revokeReason",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_support_sessions
      WHERE id = ${input.sessionId}
      LIMIT 1
    `;
    const session = rows[0];
    if (!session || session.status !== 'ACTIVE') {
      throw new ForbiddenException('Active support session is required.');
    }
    if (session.requesterPlatformUserId !== input.actorUserId) {
      throw new ForbiddenException('Support session is bound to another platform actor.');
    }
    if (session.tenantId !== input.tenantId) {
      throw new ForbiddenException('Support session tenant scope mismatch.');
    }
    if (input.write && session.accessMode !== 'CONTROLLED_WRITE') {
      throw new ForbiddenException('Support session does not permit write operations.');
    }
    const scopes = this.normalizeStoredScopes(session.scopes);
    if (!scopes.includes(input.requiredScope)) {
      throw new ForbiddenException('Support session does not include the required scope.');
    }
    return session;
  }

  private async expireDue() {
    await this.prisma.$executeRaw`
      UPDATE platform_support_sessions
      SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP
    `;
  }

  private async assertActiveOwner(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ userId: string }>>`
      SELECT pau.user_id AS "userId"
      FROM platform_admin_users pau
      INNER JOIN platform_admin_user_roles paur ON paur.user_id = pau.user_id
      WHERE pau.user_id = ${userId}
        AND pau.status = 'ACTIVE'
        AND paur.role_slug = 'PLATFORM_OWNER'
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new ForbiddenException('Active PLATFORM_OWNER authority is required.');
    }
  }

  private async assertTicketEligible(
    db: Pick<PrismaService, '$queryRaw'> | Prisma.TransactionClient,
    ticketId: string,
    tenantId: string,
    requireOpen: boolean,
  ) {
    const rows = await db.$queryRaw<Array<{ tenantId: string; status: string }>>`
      SELECT tenant_id AS "tenantId", status
      FROM platform_support_tickets
      WHERE id = ${ticketId}
      LIMIT 1
    `;
    const ticket = rows[0];
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new BadRequestException('Support ticket does not belong to the requested tenant.');
    }
    if (requireOpen && ['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      throw new BadRequestException(
        'CONTROLLED_WRITE requires a non-terminal support ticket.',
      );
    }
  }

  private accessMode(value: string): AccessMode {
    const normalized = value.trim().toUpperCase();
    if (!ACCESS_MODES.includes(normalized as AccessMode)) {
      throw new BadRequestException('Invalid support session access mode.');
    }
    return normalized as AccessMode;
  }

  private duration(value: number) {
    if (!Number.isInteger(value) || value < 5 || value > 120) {
      throw new BadRequestException(
        'durationMinutes must be an integer between 5 and 120.',
      );
    }
    return value;
  }

  private scopes(values: string[] | undefined, mode: AccessMode) {
    const defaults = ['tenant.read', 'organization.read', 'support.read'];
    const scopes = (values?.length ? values : defaults)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(scopes)];
    if (!unique.length || unique.length > 20) {
      throw new BadRequestException('Support session must contain between 1 and 20 scopes.');
    }
    for (const scope of unique) {
      if (!/^[a-z][a-z0-9_]*\.(read|write)$/.test(scope)) {
        throw new BadRequestException(`Invalid support session scope: ${scope}.`);
      }
      if (mode === 'READ_ONLY' && scope.endsWith('.write')) {
        throw new BadRequestException('READ_ONLY support sessions cannot contain write scopes.');
      }
    }
    return unique;
  }

  private normalizeStoredScopes(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private payloadObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Approved support session payload is invalid.');
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

  private requiredNumber(value: unknown, field: string) {
    if (typeof value !== 'number') {
      throw new BadRequestException(`${field} must be a number.`);
    }
    return value;
  }

  private reason(value: string) {
    const normalized = value.trim();
    if (normalized.length < 8 || normalized.length > 500) {
      throw new BadRequestException(
        'A reason between 8 and 500 characters is required.',
      );
    }
    return normalized;
  }
}
