import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { UpdateMembershipRoleInput } from './dto/update-membership-role.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private getTenantId(): string {
    return this.tenantContext.getTenantId();
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

    // Son aktif Owner'ın Owner rolünü bırakmasını engelle.
    if (
      membership.roleId !== role.id
    ) {
      const currentRole =
        await this.prisma.role.findFirst({
          where: {
            id: membership.roleId,
            tenantId,
            slug: 'owner',
          },
          select: {
            id: true,
          },
        });

      if (currentRole) {
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
    }

    return this.prisma.membership.update({
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
  }
}
