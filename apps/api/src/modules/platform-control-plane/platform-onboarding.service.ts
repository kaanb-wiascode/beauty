import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

const DEFAULT_CHECKLIST = [
  ['ACCOUNT_CREATED', 'Account created', 'Tenant, subscription and organization foundation is available.'],
  ['OWNER_ACCESS', 'Owner access', 'Primary owner has a secure invitation or active membership.'],
  ['ORGANIZATION_SETUP', 'Organization setup', 'Primary company and branch structure has been confirmed.'],
  ['ROLES_PERMISSIONS', 'Roles and permissions', 'Default tenant roles and permissions have been verified.'],
  ['BUSINESS_CONFIGURATION', 'Business configuration', 'Required tenant configuration has been reviewed.'],
  ['DATA_READINESS', 'Data readiness', 'Initial data/import requirements have been completed or waived.'],
  ['INTEGRATIONS', 'Integrations', 'Required integrations have been connected or explicitly deferred.'],
  ['TRAINING', 'Training', 'Owner/admin onboarding and product training is complete.'],
  ['GO_LIVE_REVIEW', 'Go-live review', 'Required checklist items and launch risks have been reviewed.'],
] as const;

type OnboardingStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_FOR_GO_LIVE'
  | 'COMPLETED';
type ItemStatus = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'SKIPPED';

type OnboardingRow = {
  id: string;
  tenantId: string;
  provisioningRunId: string | null;
  status: OnboardingStatus;
  ownerUserId: string | null;
  startedAt: Date | null;
  targetGoLiveAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ItemRow = {
  id: string;
  itemKey: string;
  title: string;
  description: string | null;
  position: number;
  required: boolean;
  status: ItemStatus;
  completedByUserId: string | null;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PlatformOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async ensureChecklist(
    tenantId: string,
    actorUserId: string,
    options: {
      provisioningRunId?: string | null;
      correlationId?: string | null;
      reason?: string | null;
    } = {},
    client?: Prisma.TransactionClient,
  ) {
    const db = client ?? this.prisma;
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const rows = await db.$queryRaw<OnboardingRow[]>`
      INSERT INTO platform_tenant_onboarding (
        tenant_id,
        provisioning_run_id,
        status,
        owner_user_id,
        started_at,
        updated_at
      ) VALUES (
        ${tenantId},
        ${options.provisioningRunId ?? null},
        'IN_PROGRESS',
        ${actorUserId},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        provisioning_run_id = COALESCE(
          platform_tenant_onboarding.provisioning_run_id,
          EXCLUDED.provisioning_run_id
        ),
        owner_user_id = COALESCE(platform_tenant_onboarding.owner_user_id, EXCLUDED.owner_user_id),
        started_at = COALESCE(platform_tenant_onboarding.started_at, CURRENT_TIMESTAMP),
        status = CASE
          WHEN platform_tenant_onboarding.status = 'NOT_STARTED' THEN 'IN_PROGRESS'
          ELSE platform_tenant_onboarding.status
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        id,
        tenant_id AS "tenantId",
        provisioning_run_id AS "provisioningRunId",
        status,
        owner_user_id AS "ownerUserId",
        started_at AS "startedAt",
        target_go_live_at AS "targetGoLiveAt",
        completed_at AS "completedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const onboarding = rows[0];

    for (const [position, item] of DEFAULT_CHECKLIST.entries()) {
      const [itemKey, title, description] = item;
      await db.$executeRaw`
        INSERT INTO platform_tenant_onboarding_items (
          onboarding_id, item_key, title, description, position, required
        ) VALUES (
          ${onboarding.id}, ${itemKey}, ${title}, ${description}, ${position + 1}, TRUE
        )
        ON CONFLICT (onboarding_id, item_key) DO NOTHING
      `;
    }

    return this.get(tenantId, db);
  }

  async get(tenantId: string, client?: Prisma.TransactionClient) {
    const db = client ?? this.prisma;
    const rows = await db.$queryRaw<OnboardingRow[]>`
      SELECT
        id,
        tenant_id AS "tenantId",
        provisioning_run_id AS "provisioningRunId",
        status,
        owner_user_id AS "ownerUserId",
        started_at AS "startedAt",
        target_go_live_at AS "targetGoLiveAt",
        completed_at AS "completedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_tenant_onboarding
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `;
    const onboarding = rows[0];
    if (!onboarding) throw new NotFoundException('Tenant onboarding not found.');

    const items = await db.$queryRaw<ItemRow[]>`
      SELECT
        id,
        item_key AS "itemKey",
        title,
        description,
        position,
        required,
        status,
        completed_by_user_id AS "completedByUserId",
        completed_at AS "completedAt",
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM platform_tenant_onboarding_items
      WHERE onboarding_id = ${onboarding.id}
      ORDER BY position ASC, id ASC
    `;

    const required = items.filter((item) => item.required);
    const completedRequired = required.filter((item) => item.status === 'COMPLETED').length;
    const blockingItems = items.filter((item) => item.status === 'BLOCKED').length;
    const readyForGoLive = required.length > 0 && completedRequired === required.length && blockingItems === 0;

    return {
      ...onboarding,
      items,
      summary: {
        itemCount: items.length,
        requiredCount: required.length,
        completedRequiredCount: completedRequired,
        blockingCount: blockingItems,
        readyForGoLive,
        completionPercent: required.length
          ? Math.round((completedRequired / required.length) * 100)
          : 0,
      },
    };
  }

  async updateItem(
    tenantId: string,
    itemKey: string,
    status: ItemStatus,
    actorUserId: string,
    options: {
      notes?: string | null;
      reason?: string | null;
      correlationId?: string | null;
    } = {},
  ) {
    if (!['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED'].includes(status)) {
      throw new BadRequestException('Invalid onboarding item status.');
    }

    return this.prisma.$transaction(async (tx) => {
      const onboardingRows = await tx.$queryRaw<OnboardingRow[]>`
        SELECT
          id,
          tenant_id AS "tenantId",
          provisioning_run_id AS "provisioningRunId",
          status,
          owner_user_id AS "ownerUserId",
          started_at AS "startedAt",
          target_go_live_at AS "targetGoLiveAt",
          completed_at AS "completedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM platform_tenant_onboarding
        WHERE tenant_id = ${tenantId}
        FOR UPDATE
      `;
      const onboarding = onboardingRows[0];
      if (!onboarding) throw new NotFoundException('Tenant onboarding not found.');

      const beforeRows = await tx.$queryRaw<ItemRow[]>`
        SELECT
          id,
          item_key AS "itemKey",
          title,
          description,
          position,
          required,
          status,
          completed_by_user_id AS "completedByUserId",
          completed_at AS "completedAt",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM platform_tenant_onboarding_items
        WHERE onboarding_id = ${onboarding.id} AND item_key = ${itemKey}
        FOR UPDATE
      `;
      const before = beforeRows[0];
      if (!before) throw new NotFoundException('Onboarding checklist item not found.');

      const updatedRows = await tx.$queryRaw<ItemRow[]>`
        UPDATE platform_tenant_onboarding_items
        SET
          status = ${status},
          notes = ${options.notes?.trim() || null},
          completed_by_user_id = CASE WHEN ${status} = 'COMPLETED' THEN ${actorUserId} ELSE NULL END,
          completed_at = CASE WHEN ${status} = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${before.id}
        RETURNING
          id,
          item_key AS "itemKey",
          title,
          description,
          position,
          required,
          status,
          completed_by_user_id AS "completedByUserId",
          completed_at AS "completedAt",
          notes,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;
      const updated = updatedRows[0];

      const readiness = await tx.$queryRaw<Array<{ remaining: bigint; blocked: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE required = TRUE AND status <> 'COMPLETED')::bigint AS remaining,
          COUNT(*) FILTER (WHERE status = 'BLOCKED')::bigint AS blocked
        FROM platform_tenant_onboarding_items
        WHERE onboarding_id = ${onboarding.id}
      `;
      const remaining = Number(readiness[0]?.remaining ?? 0n);
      const blocked = Number(readiness[0]?.blocked ?? 0n);
      const nextStatus: OnboardingStatus = blocked > 0
        ? 'BLOCKED'
        : remaining === 0
          ? 'READY_FOR_GO_LIVE'
          : 'IN_PROGRESS';

      await tx.$executeRaw`
        UPDATE platform_tenant_onboarding
        SET status = ${nextStatus}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${onboarding.id} AND status <> 'COMPLETED'
      `;

      await this.platformAudit.record(
        {
          actorUserId,
          resource: 'onboarding',
          action: 'checklist.item.update',
          targetTenantId: tenantId,
          targetEntityType: 'platform_tenant_onboarding_item',
          targetEntityId: updated.id,
          reason: options.reason ?? null,
          beforeState: before,
          afterState: updated,
          metadata: { itemKey, onboardingId: onboarding.id, onboardingStatus: nextStatus },
          correlationId: options.correlationId ?? null,
        },
        tx,
      );

      return this.get(tenantId, tx);
    });
  }
}
