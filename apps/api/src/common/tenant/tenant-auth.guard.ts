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
  
      if (!user?.tenantId) {
        throw new UnauthorizedException('Tenant context is missing');
      }
  
      this.tenantContext.setTenantId(user.tenantId);
  
      return true;
    }
  }