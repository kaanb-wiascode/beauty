import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { UpdateMembershipRoleInput } from './dto/update-membership-role.dto';
import { UpdateMembershipStatusInput } from './dto/update-membership-status.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  private getTenantId(): string {
    return this.tenantContext.getTenantId();
  }

  private async getActorUserId(): Promise<string> {
    const tenantId = this.getTenantId();
    const membershipId = this.tenantContext.getMembershipId();
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
      },
      select: {
        userId: true,
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'Active membership is required for membership administration',
      );
    }

    return membership.userId;
  }

  private auditMetadata() {
    const context = this.tenantContext.getContext();
    return {
      membershipId: context.membershipId,
      companyId: context.companyId,
      branchId: context.branchId,
      roleScope: context.roleScope,
    };
  }

  private async recordMembershipAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    membershipId: string,
    targetUserId: string,
    beforeState: unknown,
    afterState: unknown,
  ) {
    await this.platformAudit.record(
      {
        actorUserId,
        resource: 'memberships',
        action,
        targetTenantId: this.getTenantId(),
        targetEntityType: 'membership',
        targetEntityId: membershipId,
        beforeState,
        afterState,
        metadata: {
          ...this.auditMetadata(),
          targetUserId,
        },
      },
      tx,
    );
  }

  async findAll() {
    const tenantId = this.getTenantId();

    return this.prisma.membership.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  async findEffectivePermissions(id: string) {
    const tenantId = this.getTenantId();

    const membership = await this.prisma.membership.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        branchAccesses: {
          include: {
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
                status: true,
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        role: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const permissions = membership.role.rolePermissions
      .map(({ permission }) => ({
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        source: 'ROLE' as const,
        sourceRole: {
          id: membership.role.id,
          name: membership.role.name,
          slug: membership.role.slug,
        },
      }))
      .sort((a, b) =>
        `${a.resource}.${a.action}`.localeCompare(`${b.resource}.${b.action}`),
      );

    return {
      membership: {
        id: membership.id,
        status: membership.status,
        user: membership.user,
      },
      role: {
        id: membership.role.id,
        name: membership.role.name,
        slug: membership.role.slug,
        scope: membership.role.scope,
        company: membership.role.company,
      },
      access: {
        company: membership.company,
        branches: membership.branchAccesses.map(({ branch }) => branch),
      },
      permissions,
      summary: {
        permissionCount: permissions.length,
        branchCount: membership.branchAccesses.length,
      },
    };
  }

  async updateStatus(
    id: string,
    input: UpdateMembershipStatusInput,
  ) {
    const tenantId = this.getTenantId();

    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          role: {
            select: {
              id: true,
              slug: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (
      membership.status === input.status
    ) {
      return membership;
    }

    if (
      input.status === 'SUSPENDED' &&
      membership.role.slug === 'owner'
    ) {
      const ownerCount =
        await this.prisma.membership.count({
          where: {
            tenantId,
            role: {
              slug: 'owner',
            },
            status: 'ACTIVE',
          },
        });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Tenant must have at least one active Owner',
        );
      }
    }

    const actorUserId = await this.getActorUserId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: {
          id: membership.id,
        },
        data: {
          status: input.status,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      await this.recordMembershipAudit(
        tx,
        actorUserId,
        'status.update',
        membership.id,
        membership.user.id,
        { status: membership.status },
        { status: updated.status },
      );

      return updated;
    });
  }

  async remove(id: string) {
    const tenantId = this.getTenantId();

    const membership = await this.prisma.membership.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        role: {
          select: {
            id: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status === 'REMOVED') {
      return membership;
    }

    if (
      membership.status === 'ACTIVE' &&
      membership.role.slug === 'owner'
    ) {
      const ownerCount = await this.prisma.membership.count({
        where: {
          tenantId,
          role: {
            slug: 'owner',
          },
          status: 'ACTIVE',
        },
      });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Tenant must have at least one active Owner',
        );
      }
    }

    const actorUserId = await this.getActorUserId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: {
          id: membership.id,
        },
        data: {
          status: 'REMOVED',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      await this.recordMembershipAudit(
        tx,
        actorUserId,
        'remove',
        membership.id,
        membership.user.id,
        { status: membership.status },
        { status: updated.status },
      );

      return updated;
    });
  }

  async updateRole(
    id: string,
    input: UpdateMembershipRoleInput,
  ) {
    const tenantId = this.getTenantId();

    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id,
          tenantId,
          status: 'ACTIVE',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

    if (!membership) {
      throw new NotFoundException(
        'Membership not found',
      );
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: input.roleId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!role) {
      throw new BadRequestException(
        'Role not found',
      );
    }

    const currentRole = await this.prisma.role.findFirst({
      where: {
        id: membership.roleId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!currentRole) {
      throw new BadRequestException('Current role not found');
    }

    if (membership.roleId === role.id) {
      return this.prisma.membership.findUnique({
        where: { id: membership.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    }

    // Son aktif Owner'ın Owner rolünü bırakmasını engelle.
    if (currentRole.slug === 'owner') {
      const ownerCount =
        await this.prisma.membership.count({
          where: {
            tenantId,
            roleId: currentRole.id,
            status: 'ACTIVE',
          },
        });

      if (ownerCount <= 1) {
        throw new BadRequestException(
          'Tenant must have at least one active Owner',
        );
      }
    }

    const actorUserId = await this.getActorUserId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({
        where: {
          id: membership.id,
        },
        data: {
          roleId: role.id,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      await this.recordMembershipAudit(
        tx,
        actorUserId,
        'role.update',
        membership.id,
        membership.user.id,
        { role: currentRole },
        { role },
      );

      return updated;
    });
  }

  async replaceBranchAccess(id: string, requestedBranchIds: string[]) {
    const tenantId = this.getTenantId();
    const branchIds = [...new Set(requestedBranchIds)].sort();

    const membership = await this.prisma.membership.findFirst({
      where: {
        id,
        tenantId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        userId: true,
        companyId: true,
        role: {
          select: {
            scope: true,
          },
        },
        branchAccesses: {
          select: {
            branchId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role.scope === 'CENTRAL') {
      throw new BadRequestException(
        'Central memberships do not use explicit branch assignments',
      );
    }

    if (!membership.companyId) {
      throw new BadRequestException(
        'Company assignment is required before branch access can be managed',
      );
    }

    if (membership.role.scope === 'BRANCH' && branchIds.length === 0) {
      throw new BadRequestException(
        'Branch-scoped memberships require at least one branch assignment',
      );
    }

    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: {
            id: { in: branchIds },
            companyId: membership.companyId,
            status: 'ACTIVE',
            company: {
              tenantId,
            },
          },
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        })
      : [];

    if (branches.length !== branchIds.length) {
      throw new BadRequestException(
        'One or more branches are outside the membership company or inactive',
      );
    }

    const beforeBranchIds = membership.branchAccesses
      .map((item) => item.branchId)
      .sort();

    if (
      beforeBranchIds.length === branchIds.length &&
      beforeBranchIds.every((branchId, index) => branchId === branchIds[index])
    ) {
      return branches.sort((a, b) => a.name.localeCompare(b.name));
    }

    const actorUserId = await this.getActorUserId();

    await this.prisma.$transaction(async (tx) => {
      await tx.membershipBranchAccess.deleteMany({
        where: {
          membershipId: membership.id,
        },
      });

      for (const branchId of branchIds) {
        await tx.membershipBranchAccess.create({
          data: {
            membershipId: membership.id,
            branchId,
          },
        });
      }

      await this.recordMembershipAudit(
        tx,
        actorUserId,
        'branch_access.update',
        membership.id,
        membership.userId,
        { branchIds: beforeBranchIds },
        { branchIds },
      );
    });

    return branches.sort((a, b) => a.name.localeCompare(b.name));
  }
}
