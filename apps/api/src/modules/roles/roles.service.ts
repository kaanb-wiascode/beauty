import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateRolePermissionsInput } from './dto/update-role-permissions.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private getTenantId(): string {
    return this.tenantContext.getTenantId();
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

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      }),
      ...permissionIds.map((permissionId) =>
        this.prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId,
          },
        }),
      ),
    ]);

    return this.findOne(role.id);
  }
}
