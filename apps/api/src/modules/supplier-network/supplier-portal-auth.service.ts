import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@beauty-erp/database';
import * as argon2 from 'argon2';

export type SupplierPortalRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface SupplierPortalLoginInput {
  email: string;
  password: string;
  supplierOrganizationId?: string;
}

export interface SupplierPortalPrincipal {
  tokenType: 'supplier_portal';
  sub: string;
  supplierOrganizationId: string;
  supplierMembershipId: string;
  supplierRole: SupplierPortalRole;
}

interface SupplierPortalMembershipRow {
  supplierOrganizationId: string;
  supplierMembershipId: string;
  supplierRole: SupplierPortalRole;
  organizationSlug: string;
  organizationDisplayName: string;
  verificationStatus: string;
}

@Injectable()
export class SupplierPortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: SupplierPortalLoginInput) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const memberships = await this.prisma.$queryRawUnsafe<SupplierPortalMembershipRow[]>(
      `SELECT
         sm.supplier_organization_id AS "supplierOrganizationId",
         sm.id AS "supplierMembershipId",
         sm.role AS "supplierRole",
         so.slug AS "organizationSlug",
         so.display_name AS "organizationDisplayName",
         so.verification_status AS "verificationStatus"
       FROM supplier_memberships sm
       JOIN supplier_organizations so ON so.id=sm.supplier_organization_id
       WHERE sm.user_id=$1
         AND sm.status='ACTIVE'
         AND so.status='ACTIVE'
         AND ($2::text IS NULL OR sm.supplier_organization_id=$2::text)
       ORDER BY sm.created_at ASC`,
      user.id,
      input.supplierOrganizationId ?? null,
    );

    if (!memberships.length) {
      throw new UnauthorizedException('No active supplier membership');
    }

    if (!input.supplierOrganizationId && memberships.length > 1) {
      return {
        organizationSelectionRequired: true as const,
        organizations: memberships.map((membership) => ({
          id: membership.supplierOrganizationId,
          slug: membership.organizationSlug,
          displayName: membership.organizationDisplayName,
          verificationStatus: membership.verificationStatus,
          role: membership.supplierRole,
        })),
      };
    }

    const membership = memberships[0];
    const principal: SupplierPortalPrincipal = {
      tokenType: 'supplier_portal',
      sub: user.id,
      supplierOrganizationId: membership.supplierOrganizationId,
      supplierMembershipId: membership.supplierMembershipId,
      supplierRole: membership.supplierRole,
    };

    const accessToken = await this.jwt.signAsync(principal, {
      audience: 'supplier-portal',
      expiresIn: 900,
    });

    return {
      organizationSelectionRequired: false as const,
      accessToken,
      expiresInSeconds: 900,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      supplierOrganization: {
        id: membership.supplierOrganizationId,
        slug: membership.organizationSlug,
        displayName: membership.organizationDisplayName,
        verificationStatus: membership.verificationStatus,
      },
      membership: {
        id: membership.supplierMembershipId,
        role: membership.supplierRole,
      },
    };
  }
}
