import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from './tenant-context';
import {
  RESTRICT_TENANT_MUTATIONS_KEY,
} from './tenant-lifecycle-policy.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload; method?: string }>();

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
    const lifecycleState = lifecycle[0]?.state ?? 'ACTIVE';

    if (lifecycleState === 'SUSPENDED') {
      throw new ForbiddenException('Tenant access is suspended by the platform.');
    }

    const restrictMutations = this.reflector.getAllAndOverride<boolean>(
      RESTRICT_TENANT_MUTATIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const method = (request.method ?? 'GET').toUpperCase();

    if (
      lifecycleState === 'RESTRICTED' &&
      restrictMutations &&
      !SAFE_HTTP_METHODS.has(method)
    ) {
      throw new ForbiddenException(
        'Tenant mutations are restricted by the platform lifecycle policy.',
      );
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