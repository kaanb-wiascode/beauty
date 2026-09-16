import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { SupplierPortalRequest } from './supplier-portal-auth.guard';
import type { SupplierPortalRole } from './supplier-portal-auth.service';
import { SUPPLIER_PORTAL_ROLES_KEY } from './supplier-portal-roles.decorator';

@Injectable()
export class SupplierPortalRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<SupplierPortalRole[]>(
      SUPPLIER_PORTAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<SupplierPortalRequest>();
    const principal = request.supplierPortalAuth;

    if (!principal || !requiredRoles.includes(principal.supplierRole)) {
      throw new ForbiddenException('Insufficient supplier portal role');
    }

    return true;
  }
}
