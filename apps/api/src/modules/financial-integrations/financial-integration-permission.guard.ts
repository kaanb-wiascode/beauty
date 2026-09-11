import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@beauty-erp/database';
import type { JwtPayload } from '../../common/auth/jwt.strategy';

export const FINANCIAL_PERMISSION_KEY = 'financialIntegrationPermission';
export type FinancialIntegrationPermission = 'read' | 'manage';
export const RequireFinancialIntegrationPermission = (permission: FinancialIntegrationPermission) =>
  SetMetadata(FINANCIAL_PERMISSION_KEY, permission);

@Injectable()
export class FinancialIntegrationPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<FinancialIntegrationPermission>(
      FINANCIAL_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.roleId || !user.tenantId) {
      throw new ForbiddenException('Financial integration permission context is missing.');
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
      `SELECT EXISTS(
         SELECT 1
         FROM roles r
         JOIN role_permissions rp ON rp."roleId"=r.id
         JOIN permissions p ON p.id=rp."permissionId"
         WHERE r.id=$1::text AND r."tenantId"=$2::text
           AND p.resource='financial_integrations'
           AND p.action=$3::text
       ) AS allowed`,
      user.roleId,
      user.tenantId,
      permission,
    );

    if (!rows[0]?.allowed) {
      throw new ForbiddenException(`Missing financial_integrations.${permission} permission.`);
    }
    return true;
  }
}
