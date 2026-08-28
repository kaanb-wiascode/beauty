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
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    if (!required) {
      return true;
    }

    const request =
      context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();

    const user = request.user;

    if (
      !user?.tenantId ||
      !user.membershipId ||
      !user.roleId
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
          roleId: user.roleId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

    if (!membership) {
      throw new UnauthorizedException(
        'Membership is missing or inactive',
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
