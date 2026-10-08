import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

type TemporaryGrantRow = {
  id: string;
  tenantId: string;
  companyId: string;
  membershipId: string;
  permissionId: string;
  branchId: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  grantedByUserId: string;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TemporaryAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    const context = this.tenantContext.getContext();
    const rows = await this.prisma.$queryRaw<
      Array<
        TemporaryGrantRow & {
          permissionResource: string;
          permissionAction: string;
          userId: string;
          userEmail: string;
          branchName: string | null;
        }
      >
    >`
      SELECT g.*,
             p.resource AS "permissionResource",
             p.action AS "permissionAction",
             m."userId" AS "userId",
             u.email AS "userEmail",
             b.name AS "branchName"
      FROM temporary_permission_grants g
      JOIN permissions p ON p.id = g."permissionId"
      JOIN memberships m ON m.id = g."membershipId"
      JOIN users u ON u.id = m."userId"
      LEFT JOIN branches b ON b.id = g."branchId"
      WHERE g."tenantId" = ${context.tenantId}
        AND g."companyId" = ${context.companyId}
      ORDER BY g."createdAt" DESC
      LIMIT 500
    `;

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      status: row.revokedAt
        ? 'REVOKED'
        : row.endsAt.getTime() <= now
          ? 'EXPIRED'
          : row.startsAt.getTime() > now
            ? 'SCHEDULED'
            : 'ACTIVE',
    }));
  }

  async create(input: {
    membershipId: string;
    permissionId: string;
    branchId?: string | null;
    startsAt: string;
    endsAt: string;
    reason: string;
  }) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();
    const startsAt = this.parseDate(input.startsAt, 'Invalid temporary access start');
    const endsAt = this.parseDate(input.endsAt, 'Invalid temporary access end');
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('Temporary access end must be after start');
    }
    if (endsAt.getTime() - startsAt.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Temporary access cannot exceed 90 days');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: input.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { id: true, userId: true },
    });
    if (!membership) throw new NotFoundException('Membership not found in active company');

    const permission = await this.prisma.permission.findUnique({
      where: { id: input.permissionId },
      select: { id: true, resource: true, action: true },
    });
    if (!permission) throw new NotFoundException('Permission not found');

    const branchId = input.branchId ?? null;
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: branchId,
          companyId: context.companyId,
          status: 'ACTIVE',
          company: { tenantId: context.tenantId },
        },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch is outside active company or inactive');
    }

    const reason = input.reason.trim();
    if (reason.length < 3) throw new BadRequestException('Temporary access reason is required');
    const id = randomUUID();

    return this.prisma.$transaction(
      async (tx) => {
        const duplicate = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM temporary_permission_grants
          WHERE "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
            AND "membershipId" = ${membership.id}
            AND "permissionId" = ${permission.id}
            AND "branchId" IS NOT DISTINCT FROM ${branchId}
            AND "revokedAt" IS NULL
            AND "startsAt" < ${endsAt}
            AND "endsAt" > ${startsAt}
          LIMIT 1
          FOR UPDATE
        `;
        if (duplicate.length) {
          throw new BadRequestException('An overlapping temporary permission grant already exists');
        }

        const rows = await tx.$queryRaw<TemporaryGrantRow[]>`
          INSERT INTO temporary_permission_grants (
            id, "tenantId", "companyId", "membershipId", "permissionId", "branchId",
            "startsAt", "endsAt", reason, "grantedByUserId", "createdAt", "updatedAt"
          ) VALUES (
            ${id}, ${context.tenantId}, ${context.companyId}, ${membership.id}, ${permission.id},
            ${branchId}, ${startsAt}, ${endsAt}, ${reason}, ${actorUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          RETURNING *
        `;
        const grant = rows[0];

        await this.audit.record(
          {
            actorUserId,
            resource: 'temporary_access',
            action: 'grant',
            targetTenantId: context.tenantId,
            targetEntityType: 'temporary_permission_grant',
            targetEntityId: id,
            beforeState: null,
            afterState: {
              membershipId: membership.id,
              targetUserId: membership.userId,
              permission: `${permission.resource}.${permission.action}`,
              branchId,
              startsAt,
              endsAt,
              reason,
            },
            metadata: {
              companyId: context.companyId,
              branchId,
              actorMembershipId: context.membershipId,
            },
          },
          tx,
        );

        return grant;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revoke(id: string) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.actorUserId();

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<TemporaryGrantRow[]>`
          SELECT *
          FROM temporary_permission_grants
          WHERE id = ${id}
            AND "tenantId" = ${context.tenantId}
            AND "companyId" = ${context.companyId}
          FOR UPDATE
        `;
        const grant = rows[0];
        if (!grant) throw new NotFoundException('Temporary permission grant not found');
        if (grant.revokedAt) return grant;

        const updatedRows = await tx.$queryRaw<TemporaryGrantRow[]>`
          UPDATE temporary_permission_grants
          SET "revokedAt" = CURRENT_TIMESTAMP,
              "revokedByUserId" = ${actorUserId},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${grant.id}
          RETURNING *
        `;
        const updated = updatedRows[0];

        await this.audit.record(
          {
            actorUserId,
            resource: 'temporary_access',
            action: 'revoke',
            targetTenantId: context.tenantId,
            targetEntityType: 'temporary_permission_grant',
            targetEntityId: grant.id,
            beforeState: { revokedAt: grant.revokedAt },
            afterState: { revokedAt: updated.revokedAt },
            metadata: {
              companyId: context.companyId,
              membershipId: grant.membershipId,
              permissionId: grant.permissionId,
              branchId: grant.branchId,
            },
          },
          tx,
        );

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async activeForMembership(membershipId: string) {
    const context = this.tenantContext.getContext();
    return this.prisma.$queryRaw<
      Array<{
        id: string;
        permissionId: string;
        resource: string;
        action: string;
        description: string | null;
        branchId: string | null;
        startsAt: Date;
        endsAt: Date;
        reason: string;
      }>
    >`
      SELECT g.id, g."permissionId", p.resource, p.action, p.description,
             g."branchId", g."startsAt", g."endsAt", g.reason
      FROM temporary_permission_grants g
      JOIN permissions p ON p.id = g."permissionId"
      WHERE g."tenantId" = ${context.tenantId}
        AND g."companyId" = ${context.companyId}
        AND g."membershipId" = ${membershipId}
        AND g."revokedAt" IS NULL
        AND g."startsAt" <= CURRENT_TIMESTAMP
        AND g."endsAt" > CURRENT_TIMESTAMP
      ORDER BY p.resource, p.action, g."endsAt"
    `;
  }

  private async actorUserId() {
    const context = this.tenantContext.getContext();
    const actor = await this.prisma.membership.findFirst({
      where: {
        id: context.membershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');
    return actor.userId;
  }

  private parseDate(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
    return date;
  }
}
