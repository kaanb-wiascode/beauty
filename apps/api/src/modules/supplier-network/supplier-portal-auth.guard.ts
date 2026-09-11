import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@beauty-erp/database';
import type { Request } from 'express';

import type { SupplierPortalPrincipal, SupplierPortalRole } from './supplier-portal-auth.service';

export type SupplierPortalRequest = Request & {
  supplierPortalAuth?: SupplierPortalPrincipal;
};

interface MembershipCheckRow {
  supplierMembershipId: string;
  supplierOrganizationId: string;
  supplierRole: SupplierPortalRole;
}

@Injectable()
export class SupplierPortalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SupplierPortalRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Supplier portal access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    let payload: SupplierPortalPrincipal;

    try {
      payload = await this.jwt.verifyAsync<SupplierPortalPrincipal>(token, {
        audience: 'supplier-portal',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired supplier portal token');
    }

    if (
      payload.tokenType !== 'supplier_portal' ||
      !payload.sub ||
      !payload.supplierOrganizationId ||
      !payload.supplierMembershipId ||
      !['OWNER', 'ADMIN', 'MEMBER'].includes(payload.supplierRole)
    ) {
      throw new UnauthorizedException('Invalid supplier portal token payload');
    }

    const rows = await this.prisma.$queryRawUnsafe<MembershipCheckRow[]>(
      `SELECT
         sm.id AS "supplierMembershipId",
         sm.supplier_organization_id AS "supplierOrganizationId",
         sm.role AS "supplierRole"
       FROM supplier_memberships sm
       JOIN supplier_organizations so ON so.id=sm.supplier_organization_id
       WHERE sm.id=$1
         AND sm.user_id=$2
         AND sm.supplier_organization_id=$3
         AND sm.status='ACTIVE'
         AND so.status='ACTIVE'
       LIMIT 1`,
      payload.supplierMembershipId,
      payload.sub,
      payload.supplierOrganizationId,
    );

    const membership = rows[0];
    if (!membership || membership.supplierRole !== payload.supplierRole) {
      throw new UnauthorizedException('Supplier membership is inactive or changed');
    }

    request.supplierPortalAuth = payload;
    return true;
  }
}
