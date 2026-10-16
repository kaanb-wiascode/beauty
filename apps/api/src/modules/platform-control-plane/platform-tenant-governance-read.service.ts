import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

type LifecycleRow = {
  tenantId: string;
  state: string;
  reason: string | null;
  version: number;
  updatedByUserId: string | null;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type GovernanceOperationRow = {
  id: string;
  requesterUserId: string;
  requesterEmail: string;
  approverUserId: string | null;
  approverEmail: string | null;
  resource: string;
  action: string;
  riskLevel: string;
  status: string;
  reason: string;
  decisionReason: string | null;
  requestId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  executedAt: Date | null;
  expiresAt: Date;
};

type GovernanceAuditRow = {
  id: string;
  actorUserId: string;
  actorEmail: string | null;
  resource: string;
  action: string;
  targetEntityType: string | null;
  targetEntityId: string | null;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  requestId: string | null;
  correlationId: string | null;
  riskLevel: string | null;
  approvalRequestId: string | null;
  createdAt: Date;
};

@Injectable()
export class PlatformTenantGovernanceReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantGovernance(tenantId: string) {
    const lifecycleRows = await this.prisma.$queryRaw<LifecycleRow[]>`
      SELECT
        t.id AS "tenantId",
        COALESCE(ptl.state, 'ACTIVE')::text AS state,
        ptl.reason,
        COALESCE(ptl.version, 0)::int AS version,
        ptl.updated_by_user_id AS "updatedByUserId",
        updater.email AS "updatedByEmail",
        COALESCE(ptl.created_at, t."createdAt") AS "createdAt",
        COALESCE(ptl.updated_at, t."updatedAt") AS "updatedAt"
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      LEFT JOIN users updater ON updater.id = ptl.updated_by_user_id
      WHERE t.id = ${tenantId}
      LIMIT 1
    `;

    const lifecycle = lifecycleRows[0];
    if (!lifecycle) {
      throw new NotFoundException('Platform customer tenant was not found.');
    }

    const operations = await this.prisma.$queryRaw<GovernanceOperationRow[]>`
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
        r.reason,
        r.decision_reason AS "decisionReason",
        r.request_id AS "requestId",
        r.created_at AS "createdAt",
        r.decided_at AS "decidedAt",
        r.executed_at AS "executedAt",
        r.expires_at AS "expiresAt"
      FROM platform_privileged_action_requests r
      INNER JOIN users requester ON requester.id = r.requester_user_id
      LEFT JOIN users approver ON approver.id = r.approver_user_id
      WHERE r.target_tenant_id = ${tenantId}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 20
    `;

    const auditTimeline = await this.prisma.$queryRaw<GovernanceAuditRow[]>`
      SELECT
        pae.id,
        pae.actor_user_id AS "actorUserId",
        actor.email AS "actorEmail",
        pae.resource,
        pae.action,
        pae.target_entity_type AS "targetEntityType",
        pae.target_entity_id AS "targetEntityId",
        pae.reason,
        pae.before_state AS "beforeState",
        pae.after_state AS "afterState",
        pae.metadata,
        pae.request_id AS "requestId",
        pae.correlation_id AS "correlationId",
        pae.risk_level AS "riskLevel",
        pae.approval_request_id AS "approvalRequestId",
        pae.created_at AS "createdAt"
      FROM platform_audit_events pae
      LEFT JOIN users actor ON actor.id = pae.actor_user_id
      WHERE pae.target_tenant_id = ${tenantId}
      ORDER BY pae.created_at DESC, pae.id DESC
      LIMIT 30
    `;

    return { lifecycle, operations, auditTimeline };
  }
}
