import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

@Injectable()
export class RoleCloneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly audit: PlatformAuditService,
  ) {}

  async clone(sourceRoleId: string, input: { name: string; description?: string }) {
    const context = this.tenantContext.getContext();
    const name = input.name.trim();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) throw new BadRequestException('Invalid role name');

    const source = await this.prisma.role.findFirst({
      where: {
        id: sourceRoleId,
        tenantId: context.tenantId,
        companyId: context.companyId,
      },
      include: {
        rolePermissions: {
          select: { permissionId: true },
        },
      },
    });
    if (!source) throw new NotFoundException('Source role not found');
    if (source.slug === 'owner') {
      throw new BadRequestException('Owner role cannot be cloned');
    }

    const duplicate = await this.prisma.role.findFirst({
      where: {
        tenantId: context.tenantId,
        OR: [{ slug }, { companyId: context.companyId, name }],
      },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('Role name or slug already exists');

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

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          tenantId: context.tenantId,
          companyId: context.companyId,
          name,
          slug,
          description: input.description?.trim() || source.description || null,
          scope: source.scope,
        },
      });

      if (source.rolePermissions.length) {
        await tx.rolePermission.createMany({
          data: source.rolePermissions.map(({ permissionId }) => ({
            roleId: created.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }

      await this.audit.record(
        {
          actorUserId: actor.userId,
          resource: 'roles',
          action: 'clone',
          targetTenantId: context.tenantId,
          targetEntityType: 'role',
          targetEntityId: created.id,
          beforeState: null,
          afterState: {
            id: created.id,
            name: created.name,
            slug: created.slug,
            scope: created.scope,
            sourceRoleId: source.id,
            permissionCount: source.rolePermissions.length,
          },
          metadata: {
            companyId: context.companyId,
            sourceRoleId: source.id,
            actorMembershipId: context.membershipId,
          },
        },
        tx as Prisma.TransactionClient,
      );

      return tx.role.findUnique({
        where: { id: created.id },
        include: {
          rolePermissions: { include: { permission: true } },
          _count: { select: { memberships: true, rolePermissions: true } },
        },
      });
    });
  }
}
