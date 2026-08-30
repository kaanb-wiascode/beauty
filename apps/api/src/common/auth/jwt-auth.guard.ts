import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { TenantContext } from '../tenant/tenant-context';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly tenantContext: TenantContext,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = JwtPayload>(
    err: unknown,
    user: TUser,
    info?: unknown,
    context?: ExecutionContext,
  ): TUser {
    if (err) {
      throw err;
    }

    if (!user) {
      throw new UnauthorizedException('JWT user not found');
    }

    const jwtUser = user as TUser & JwtPayload;

    if (
      !jwtUser.tenantId ||
      !jwtUser.companyId ||
      !jwtUser.roleScope
    ) {
      throw new UnauthorizedException(
        'Organization context is missing',
      );
    }

    this.tenantContext.setContext({
      tenantId: jwtUser.tenantId,
      companyId: jwtUser.companyId,
      branchId: jwtUser.branchId ?? null,
      roleScope: jwtUser.roleScope,
    });

    return user;
  }
}
