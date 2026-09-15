import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { SecurityPolicyService } from './security-policy.service';

export type CreateInvitationInput = {
  email: string;
  roleId: string;
  branchIds: string[];
  expiresInHours: number;
};

export type AcceptInvitationInput = {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
};

type InvitationRow = {
  id: string;
  tenantId: string;
  companyId: string;
  email: string;
  roleId: string;
  branchIds: unknown;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
};

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const normalizeBranchIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  async create(
    input: CreateInvitationInput,
    context: {
      tenantId: string;
      companyId: string;
      actorMembershipId: string;
    },
  ) {
    const email = input.email.trim().toLowerCase();
    const branchIds = [...new Set(input.branchIds)].sort();
    const role = await this.prisma.role.findFirst({
      where: {
        id: input.roleId,
        tenantId: context.tenantId,
        companyId: context.companyId,
      },
      select: { id: true, name: true, slug: true, scope: true },
    });
    if (!role) throw new BadRequestException('Role not found in current company');

    if (role.scope === 'CENTRAL' && branchIds.length > 0) {
      throw new BadRequestException('Central roles do not use explicit branch assignments');
    }
    if (role.scope === 'BRANCH' && branchIds.length === 0) {
      throw new BadRequestException('Branch-scoped roles require at least one branch');
    }

    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: {
            id: { in: branchIds },
            companyId: context.companyId,
            status: 'ACTIVE',
            company: { tenantId: context.tenantId },
          },
          select: { id: true },
        })
      : [];
    if (branches.length !== branchIds.length) {
      throw new BadRequestException('One or more branches are invalid or inactive');
    }

    const actor = await this.prisma.membership.findFirst({
      where: {
        id: context.actorMembershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, memberships: { where: { tenantId: context.tenantId }, select: { id: true } } },
    });
    if (existingUser?.memberships.length) {
      throw new ConflictException('User already belongs to this tenant');
    }
    if (existingUser) {
      throw new ConflictException('Email is already registered; existing-user invitation is not supported yet');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const invitationId = randomUUID();
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    const branchIdsJson = JSON.stringify(branchIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE user_invitations
        SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = ${context.tenantId}
          AND "companyId" = ${context.companyId}
          AND email = ${email}
          AND "acceptedAt" IS NULL
          AND "revokedAt" IS NULL
      `;

      await tx.$executeRaw`
        INSERT INTO user_invitations (
          id, "tenantId", "companyId", email, "roleId", "branchIds",
          "tokenHash", "invitedByUserId", "expiresAt", "createdAt", "updatedAt"
        ) VALUES (
          ${invitationId}, ${context.tenantId}, ${context.companyId}, ${email},
          ${role.id}, ${branchIdsJson}::jsonb, ${tokenHash}, ${actor.userId},
          ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

      await this.platformAudit.record(
        {
          actorUserId: actor.userId,
          resource: 'invitations',
          action: 'create',
          targetTenantId: context.tenantId,
          targetEntityType: 'user_invitation',
          targetEntityId: invitationId,
          beforeState: null,
          afterState: {
            email,
            roleId: role.id,
            roleScope: role.scope,
            branchIds,
            expiresAt,
          },
          metadata: {
            companyId: context.companyId,
            membershipId: context.actorMembershipId,
          },
        },
        tx,
      );
    });

    return {
      id: invitationId,
      email,
      role,
      branchIds,
      expiresAt,
      status: 'PENDING' as const,
      token: rawToken,
    };
  }

  async list(tenantId: string, companyId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        roleId: string;
        roleName: string;
        roleSlug: string;
        roleScope: string;
        branchIds: unknown;
        expiresAt: Date;
        revokedAt: Date | null;
        acceptedAt: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT i.id, i.email, i."roleId", r.name AS "roleName", r.slug AS "roleSlug",
             r.scope::text AS "roleScope", i."branchIds", i."expiresAt", i."revokedAt",
             i."acceptedAt", i."createdAt"
      FROM user_invitations i
      JOIN roles r ON r.id = i."roleId"
      WHERE i."tenantId" = ${tenantId} AND i."companyId" = ${companyId}
      ORDER BY i."createdAt" DESC
      LIMIT 200
    `;

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      branchIds: normalizeBranchIds(row.branchIds),
      status: row.acceptedAt
        ? 'ACCEPTED'
        : row.revokedAt
          ? 'REVOKED'
          : row.expiresAt.getTime() <= now
            ? 'EXPIRED'
            : 'PENDING',
    }));
  }

  async revoke(
    invitationId: string,
    context: { tenantId: string; companyId: string; actorMembershipId: string },
  ) {
    const actor = await this.prisma.membership.findFirst({
      where: {
        id: context.actorMembershipId,
        tenantId: context.tenantId,
        companyId: context.companyId,
        status: 'ACTIVE',
      },
      select: { userId: true },
    });
    if (!actor) throw new BadRequestException('Active administrator membership is required');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<InvitationRow[]>`
        SELECT * FROM user_invitations
        WHERE id = ${invitationId}
          AND "tenantId" = ${context.tenantId}
          AND "companyId" = ${context.companyId}
        FOR UPDATE
      `;
      const invitation = rows[0];
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.acceptedAt) throw new BadRequestException('Accepted invitation cannot be revoked');
      if (invitation.revokedAt) {
        return { id: invitation.id, status: 'REVOKED' as const };
      }

      await tx.$executeRaw`
        UPDATE user_invitations
        SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${invitation.id}
      `;
      await this.platformAudit.record(
        {
          actorUserId: actor.userId,
          resource: 'invitations',
          action: 'revoke',
          targetTenantId: context.tenantId,
          targetEntityType: 'user_invitation',
          targetEntityId: invitation.id,
          beforeState: { revokedAt: null },
          afterState: { revokedAt: new Date() },
          metadata: { companyId: context.companyId, email: invitation.email },
        },
        tx,
      );
      return { id: invitation.id, status: 'REVOKED' as const };
    });
  }

  async accept(input: AcceptInvitationInput) {
    const token = input.token.trim();
    if (!token) throw new BadRequestException('Invitation token is required');
    const tokenHash = hashToken(token);

    const preview = await this.prisma.$queryRaw<InvitationRow[]>`
      SELECT * FROM user_invitations WHERE "tokenHash" = ${tokenHash} LIMIT 1
    `;
    const candidate = preview[0];
    if (!candidate || candidate.revokedAt || candidate.acceptedAt || candidate.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invitation is invalid or expired');
    }

    const policy = await this.securityPolicy.get(candidate.tenantId, candidate.companyId);
    const minimumLength = Number(policy.passwordMinLength);
    if (input.password.length < minimumLength) {
      throw new BadRequestException(
        `Password must be at least ${minimumLength} characters`,
      );
    }
    const passwordHash = await argon2.hash(input.password);

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<InvitationRow[]>`
          SELECT * FROM user_invitations
          WHERE "tokenHash" = ${tokenHash}
          FOR UPDATE
        `;
        const invitation = rows[0];
        if (
          !invitation ||
          invitation.revokedAt ||
          invitation.acceptedAt ||
          invitation.expiresAt.getTime() <= Date.now()
        ) {
          throw new BadRequestException('Invitation is invalid or expired');
        }

        const company = await tx.company.findFirst({
          where: { id: invitation.companyId, tenantId: invitation.tenantId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!company) throw new BadRequestException('Invitation company is inactive');

        const role = await tx.role.findFirst({
          where: {
            id: invitation.roleId,
            tenantId: invitation.tenantId,
            companyId: invitation.companyId,
          },
          select: { id: true, scope: true },
        });
        if (!role) throw new BadRequestException('Invitation role is no longer available');

        const branchIds = normalizeBranchIds(invitation.branchIds);
        const branches = branchIds.length
          ? await tx.branch.findMany({
              where: {
                id: { in: branchIds },
                companyId: invitation.companyId,
                status: 'ACTIVE',
              },
              select: { id: true },
            })
          : [];
        if (branches.length !== branchIds.length || (role.scope === 'BRANCH' && branchIds.length === 0)) {
          throw new BadRequestException('Invitation organization scope is no longer valid');
        }

        const existingUser = await tx.user.findUnique({
          where: { email: invitation.email },
          select: { id: true },
        });
        if (existingUser) throw new ConflictException('Email is already registered');

        const user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: invitation.tenantId,
            companyId: invitation.companyId,
            roleId: role.id,
          },
          select: { id: true, status: true, roleId: true, companyId: true },
        });
        for (const branchId of branchIds) {
          await tx.membershipBranchAccess.create({
            data: { membershipId: membership.id, branchId },
          });
        }

        await tx.$executeRaw`
          UPDATE user_invitations
          SET "acceptedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${invitation.id}
        `;
        await this.platformAudit.record(
          {
            actorUserId: user.id,
            resource: 'invitations',
            action: 'accept',
            targetTenantId: invitation.tenantId,
            targetEntityType: 'user_invitation',
            targetEntityId: invitation.id,
            beforeState: { acceptedAt: null },
            afterState: { acceptedAt: new Date(), membershipId: membership.id },
            metadata: {
              companyId: invitation.companyId,
              roleId: role.id,
              branchIds,
            },
          },
          tx,
        );

        return { user, membership };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
