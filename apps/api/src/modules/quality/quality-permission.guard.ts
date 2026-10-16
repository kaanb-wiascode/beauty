import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@beauty-erp/database';
import type { JwtPayload } from '../../common/auth/jwt.strategy';

export const QUALITY_PERMISSION_KEY = 'qualityPermission';
export type QualityPermission = 'read' | 'manage';
export const RequireQualityPermission = (permission: QualityPermission) => SetMetadata(QUALITY_PERMISSION_KEY, permission);

@Injectable()
export class QualityPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<QualityPermission>(QUALITY_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.roleId || !user.tenantId) throw new ForbiddenException('Quality permission context is missing.');

    const rows = await this.prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
      `SELECT EXISTS(
         SELECT 1
         FROM roles r
         JOIN role_permissions rp ON rp."roleId"=r.id
         JOIN permissions p ON p.id=rp."permissionId"
         WHERE r.id=$1::text AND r."tenantId"=$2::text
           AND p.resource='quality' AND p.action=$3::text
       ) AS allowed`,
      user.roleId,
      user.tenantId,
      permission,
    );
    if (!rows[0]?.allowed) throw new ForbiddenException(`Missing quality.${permission} permission.`);
    return true;
  }
}
