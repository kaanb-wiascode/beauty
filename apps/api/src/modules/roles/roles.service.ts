import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { UpdateRolePermissionsInput } from './dto/update-role-permissions.dto';
import { CreateRoleInput } from './dto/create-role.dto';
import { UpdateRoleInput } from './dto/update-role.dto';

@Injectable()
export class RolesService {
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
      throw new BadRequestException('Active membership is required for role administration');
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

  private async recordRoleAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    roleId: string,
    beforeState: unknown,
    afterState: unknown,
    metadata?: Record<string, unknown>,
  ) {
    await this.platformAudit.record(
      {
        actorUserId,
        resource: 'roles',
        action,
        targetTenantId: this.getTenantId(),
        targetEntityType: 'role',
        targetEntityId: roleId,
        beforeState,
        afterState,
        metadata: {
          ...this.auditMetadata(),
          ...metadata,
        },
      },
      tx,
    );
  }

  async create(input: CreateRoleInput) {
    const tenantId = this.getTenantId();

    const slug = input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException('Invalid role name');
    }

    const existing = await this.prisma.role.findFirst({
      where: {
        tenantId,
        OR: [
          { name: input.name.trim() },
          { slug },
        ],
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Role already exists');
    }

    const actorUserId = await this.getActorUserId();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          tenantId,
          name: input.name.trim(),
          slug,
          description: input.description?.trim() || null,
        },
        include: {
          _count: {
            select: {
              memberships: true,
              rolePermissions: true,
            },
          },
        },
      });

      await this.recordRoleAudit(
        tx,
        actorUserId,
        'create',
        created.id,
        null,
        {
          id: created.id,
          name: created.name,
          slug: created.slug,
          description: created.description,
        },
      );

      return created;
    });
  }

  async findAll() {
    const tenantId = this.getTenantId();

    return this.prisma.role.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        _count: {
          select: {
            memberships: true,
            rolePermissions: true,
          },
        },
      },
    });
  }

  async findPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [
        { resource: 'asc' },
        { action: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const tenantId = this.getTenantId();

    const role = await this.prisma.role.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
          orderBy: {
            permission: {
              resource: 'asc',
            },
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, input: UpdateRoleInput) {
    const tenantId = this.getTenantId();

    const role = await this.prisma.role.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.slug === 'owner') {
      throw new BadRequestException(
        'Owner role cannot be renamed',
      );
    }

    const data: {
      name?: string;
      description?: string | null;
    } = {};

    if (input.name !== undefined) {
      data.name = input.name.trim();
    }

    if (input.description !== undefined) {
      data.description =
        input.description?.trim() || null;
    }

    if (data.name) {
      const duplicate = await this.prisma.role.findFirst({
        where: {
          tenantId,
          id: { not: id },
          name: data.name,
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new BadRequestException(
          'Role name already exists',
        );
      }
    }

    const actorUserId = await this.getActorUserId();

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        },
      });

      await this.recordRoleAudit(
        tx,
        actorUserId,
        'update',
        id,
        role,
        updated,
      );
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const tenantId = this.getTenantId();

    const role = await this.prisma.role.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.slug === 'owner') {
      throw new BadRequestException(
        'Owner role cannot be deleted',
      );
    }

    if (role._count.memberships > 0) {
      throw new BadRequestException(
        'Role is assigned to users',
      );
    }

    const actorUserId = await this.getActorUserId();

    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({
        where: {
          id: role.id,
        },
      });

      await this.recordRoleAudit(
        tx,
        actorUserId,
        'delete',
        role.id,
        {
          id: role.id,
          name: role.name,
          slug: role.slug,
          description: role.description,
        },
        { deleted: true },
      );
    });

    return {
      deleted: true,
      id: role.id,
    };
  }

  async updatePermissions(
    id: string,
    input: UpdateRolePermissionsInput,
  ) {
    const tenantId = this.getTenantId();

    const role = await this.prisma.role.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permissionIds = [
      ...new Set(input.permissionIds),
    ];

    const permissions = await this.prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (permissions.length !== permissionIds.length) {
      throw new BadRequestException(
        'One or more permissions were not found',
      );
    }

    // Owner rolünün kendisini kilitlememek için:
    // roles.update yetkisini kaldırmaya izin vermiyoruz.
    if (role.slug === 'owner') {
      const rolesUpdatePermission =
        await this.prisma.permission.findUnique({
          where: {
            resource_action: {
              resource: 'roles',
              action: 'update',
            },
          },
          select: {
            id: true,
          },
        });

      if (
        rolesUpdatePermission &&
        !permissionIds.includes(rolesUpdatePermission.id)
      ) {
        throw new BadRequestException(
          'Owner must keep roles.update permission',
        );
      }
    }

    const currentPermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId: role.id,
      },
      select: {
        permissionId: true,
      },
    });
    const beforePermissionIds = currentPermissions
      .map((item) => item.permissionId)
      .sort();
    const afterPermissionIds = [...permissionIds].sort();
    const actorUserId = await this.getActorUserId();

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      });

      for (const permissionId of permissionIds) {
        await tx.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId,
          },
        });
      }

      await this.recordRoleAudit(
        tx,
        actorUserId,
        'permissions.update',
        role.id,
        { permissionIds: beforePermissionIds },
        { permissionIds: afterPermissionIds },
        {
          roleName: role.name,
          roleSlug: role.slug,
        },
      );
    });

    return this.findOne(role.id);
  }
}
