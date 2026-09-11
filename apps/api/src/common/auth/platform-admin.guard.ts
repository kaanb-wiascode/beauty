import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { sub?: string };
    }>();
    const userId = request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT user_id AS "userId"
       FROM platform_admin_users
       WHERE user_id=$1 AND status='ACTIVE'
       LIMIT 1`,
      userId,
    );

    if (!rows.length) {
      throw new ForbiddenException('Platform administrator access is required.');
    }

    return true;
  }
}
