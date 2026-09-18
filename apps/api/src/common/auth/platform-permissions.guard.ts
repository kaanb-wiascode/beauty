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
  REQUIRED_PLATFORM_PERMISSION_KEY,
  RequiredPlatformPermission,
} from './platform-permissions.decorator';

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<RequiredPlatformPermission>(
        REQUIRED_PLATFORM_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { sub?: string };
    }>();
    const userId = request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }

    const rows = await this.prisma.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM platform_admin_users pau
        INNER JOIN platform_admin_user_roles paur
          ON paur.user_id = pau.user_id
        INNER JOIN platform_role_permissions prp
          ON prp.role_slug = paur.role_slug
        WHERE pau.user_id = ${userId}
          AND pau.status = 'ACTIVE'
          AND prp.resource = ${required.resource}
          AND prp.action = ${required.action}
      ) AS allowed
    `;

    if (!rows[0]?.allowed) {
      throw new ForbiddenException(
        'You do not have the required platform permission.',
      );
    }

    return true;
  }
}
