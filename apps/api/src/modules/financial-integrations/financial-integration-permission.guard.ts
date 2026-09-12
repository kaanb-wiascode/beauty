import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
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
    if (
      !user?.sub ||
      !user.roleId ||
      !user.tenantId ||
      !user.membershipId ||
      !user.companyId ||
      !user.roleScope
    ) {
      throw new UnauthorizedException('Financial integration permission context is missing.');
    }

    const membership = await this.prisma.membership.findFirst({
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
            tenantId: true,
            companyId: true,
            scope: true,
          },
        },
        branchAccesses: {
          select: { branchId: true },
        },
      },
    });

    if (!membership || membership.role.scope !== user.roleScope) {
      throw new UnauthorizedException('Financial integration membership is missing or inactive.');
    }

    if (
      membership.role.companyId &&
      membership.role.companyId !== user.companyId
    ) {
      throw new UnauthorizedException('Financial integration organization context is invalid.');
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
        throw new ForbiddenException('You do not have access to this branch.');
      }

      if (user.roleScope !== 'CENTRAL') {
        const hasBranchAccess = membership.branchAccesses.some(
          (access) => access.branchId === user.branchId,
        );
        if (!hasBranchAccess) {
          throw new ForbiddenException('You do not have access to this branch.');
        }
      }
    } else if (user.roleScope === 'BRANCH') {
      throw new UnauthorizedException('Branch context is required.');
    }

    const rolePermission = await this.prisma.rolePermission.findFirst({
      where: {
        roleId: user.roleId,
        permission: {
          resource: 'financial_integrations',
          action: permission,
        },
        role: {
          tenantId: user.tenantId,
          OR: [
            { companyId: null },
            { companyId: user.companyId },
          ],
        },
      },
      select: { roleId: true },
    });

    if (!rolePermission) {
      throw new ForbiddenException(`Missing financial_integrations.${permission} permission.`);
    }
    return true;
  }
}
