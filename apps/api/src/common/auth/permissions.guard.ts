import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';

import {
  REQUIRED_PERMISSION_KEY,
  RequiredPermission,
} from './permissions.decorator';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<RequiredPermission>(
        REQUIRED_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!required) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

    const user = request.user;

    if (
      !user?.tenantId ||
      !user.membershipId ||
      !user.roleId ||
      !user.companyId ||
      !user.roleScope
    ) {
      throw new UnauthorizedException(
        'Authentication context is missing',
      );
    }

    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id: user.membershipId,
          userId: user.sub,
          tenantId: user.tenantId,
          companyId: user.companyId,
          roleId: user.roleId,
          status: 'ACTIVE',
        },
        include: {
          role: {
            select: {
              id: true,
              companyId: true,
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
      throw new UnauthorizedException(
        'Membership is missing or inactive',
      );
    }

    if (
      membership.role.companyId &&
      membership.role.companyId !== membership.companyId
    ) {
      throw new UnauthorizedException(
        'Role organization context is invalid',
      );
    }

    if (membership.role.scope !== user.roleScope) {
      throw new UnauthorizedException(
        'Role scope is out of date',
      );
    }

    if (user.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: user.branchId,
          companyId: user.companyId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (!branch) {
        throw new ForbiddenException(
          'You do not have access to this branch',
        );
      }

      if (user.roleScope === 'BRANCH') {
        const hasBranchAccess = membership.branchAccesses.some(
          (access) => access.branchId === user.branchId,
        );

        if (!hasBranchAccess) {
          throw new ForbiddenException(
            'You do not have access to this branch',
          );
        }
      } else if (user.roleScope === 'COMPANY') {
        const hasBranchAccess = membership.branchAccesses.some(
          (access) => access.branchId === user.branchId,
        );

        if (!hasBranchAccess) {
          throw new ForbiddenException(
            'You do not have access to this branch',
          );
        }
      }
      // CENTRAL scope may use any active branch inside its company.
    } else if (user.roleScope === 'BRANCH') {
      throw new UnauthorizedException(
        'Branch context is required',
      );
    }

    const rolePermission =
      await this.prisma.rolePermission.findFirst({
        where: {
          roleId: user.roleId,
          permission: {
            resource: required.resource,
            action: required.action,
          },
          role: {
            tenantId: user.tenantId,
            OR: [
              { companyId: null },
              { companyId: user.companyId },
            ],
          },
        },
        select: {
          roleId: true,
        },
      });

    if (!rolePermission) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
