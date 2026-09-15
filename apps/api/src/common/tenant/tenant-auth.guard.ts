import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from './tenant-context';
import type { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload }>();

    const user = request.user;

    if (
      !user?.tenantId ||
      !user.membershipId ||
      !user.companyId ||
      !user.roleScope
    ) {
      throw new UnauthorizedException(
        'Organization context is missing',
      );
    }

    const lifecycle = await this.prisma.$queryRaw<Array<{ state: string }>>`
      SELECT COALESCE(ptl.state, 'ACTIVE')::text AS state
      FROM tenants t
      LEFT JOIN platform_tenant_lifecycle ptl ON ptl.tenant_id = t.id
      WHERE t.id = ${user.tenantId}
      LIMIT 1
    `;

    if (lifecycle[0]?.state === 'SUSPENDED') {
      throw new ForbiddenException('Tenant access is suspended by the platform.');
    }

    this.tenantContext.setContext({
      tenantId: user.tenantId,
      membershipId: user.membershipId,
      companyId: user.companyId,
      branchId: user.branchId ?? null,
      roleScope: user.roleScope,
    });

    return true;
  }
}