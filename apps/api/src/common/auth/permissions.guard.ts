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
  REQUIRED_PERMISSIONS_KEY,
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
    const requiredAll =
      this.reflector.getAllAndOverride<readonly RequiredPermission[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );
    const requirements = [
      ...(required ? [required] : []),
      ...(requiredAll ?? []),
    ];

    if (requirements.length === 0) {
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

    const uniqueRequirements = Array.from(
      new Map(
        requirements.map((permission) => [
          `${permission.resource}:${permission.action}`,
          permission,
        ]),
      ).values(),
    );

    const rolePermissions =
      await this.prisma.rolePermission.findMany({
        where: {
          roleId: user.roleId,
          OR: uniqueRequirements.map((permission) => ({
            permission: {
              resource: permission.resource,
              action: permission.action,
            },
          })),
          role: {
            tenantId: user.tenantId,
            OR: [
              { companyId: null },
              { companyId: user.companyId },
            ],
          },
        },
        select: {
          permission: {
            select: {
              resource: true,
              action: true,
            },
          },
        },
      });

    const granted = new Set(
      rolePermissions.map(
        ({ permission }) =>
          `${permission.resource}:${permission.action}`,
      ),
    );

    const missing = uniqueRequirements.filter(
      (permission) => !granted.has(`${permission.resource}:${permission.action}`),
    );

    if (missing.length > 0) {
      const temporaryPermissions = await this.prisma.$queryRaw<
        Array<{ resource: string; action: string }>
      >`
        SELECT DISTINCT p.resource, p.action
        FROM temporary_permission_grants g
        JOIN permissions p ON p.id = g."permissionId"
        WHERE g."tenantId" = ${user.tenantId}
          AND g."companyId" = ${user.companyId}
          AND g."membershipId" = ${user.membershipId}
          AND g."revokedAt" IS NULL
          AND g."startsAt" <= CURRENT_TIMESTAMP
          AND g."endsAt" > CURRENT_TIMESTAMP
          AND (
            g."branchId" IS NULL
            OR g."branchId" IS NOT DISTINCT FROM ${user.branchId}
          )
      `;

      for (const permission of temporaryPermissions) {
        granted.add(`${permission.resource}:${permission.action}`);
      }
    }

    const hasAllPermissions = uniqueRequirements.every(
      (permission) =>
        granted.has(`${permission.resource}:${permission.action}`),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
