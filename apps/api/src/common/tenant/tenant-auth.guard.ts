import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { TenantContext } from './tenant-context';
import type { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtPayload }>();

    const user = request.user;

    if (
      !user?.tenantId ||
      !user.companyId ||
      !user.roleScope
    ) {
      throw new UnauthorizedException(
        'Organization context is missing',
      );
    }

    this.tenantContext.setContext({
      tenantId: user.tenantId,
      companyId: user.companyId,
      branchId: user.branchId ?? null,
      roleScope: user.roleScope,
    });

    return true;
  }
}
