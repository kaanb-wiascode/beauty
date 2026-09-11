import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { PrismaService } from '@beauty-erp/database';
import { SupplierPortalAuthService } from './supplier-portal-auth.service';

describe('SupplierPortalAuthService', () => {
  const findUnique = jest.fn();
  const queryRawUnsafe = jest.fn();
  const signAsync = jest.fn();

  const prisma = {
    user: { findUnique },
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const jwt = {
    signAsync,
  } as unknown as JwtService;

  const service = new SupplierPortalAuthService(prisma, jwt);
  let passwordHash = '';

  beforeAll(async () => {
    passwordHash = await argon2.hash('secret-123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'supplier@example.com',
      firstName: 'Supplier',
      lastName: 'User',
      passwordHash,
    });
    signAsync.mockResolvedValue('supplier-token');
  });

  it('rejects invalid credentials before reading supplier memberships', async () => {
    await expect(
      service.login({ email: 'supplier@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(queryRawUnsafe).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('requires organization selection when the user has multiple active supplier memberships', async () => {
    queryRawUnsafe.mockResolvedValue([
      {
        supplierOrganizationId: 'org-1',
        supplierMembershipId: 'membership-1',
        supplierRole: 'OWNER',
        organizationSlug: 'supplier-one',
        organizationDisplayName: 'Supplier One',
        verificationStatus: 'VERIFIED',
      },
      {
        supplierOrganizationId: 'org-2',
        supplierMembershipId: 'membership-2',
        supplierRole: 'ADMIN',
        organizationSlug: 'supplier-two',
        organizationDisplayName: 'Supplier Two',
        verificationStatus: 'PENDING',
      },
    ]);

    await expect(
      service.login({ email: 'supplier@example.com', password: 'secret-123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(signAsync).not.toHaveBeenCalled();
  });

  it('issues a supplier-portal-scoped token for the selected active membership', async () => {
    queryRawUnsafe.mockResolvedValue([
      {
        supplierOrganizationId: 'org-1',
        supplierMembershipId: 'membership-1',
        supplierRole: 'ADMIN',
        organizationSlug: 'supplier-one',
        organizationDisplayName: 'Supplier One',
        verificationStatus: 'VERIFIED',
      },
    ]);

    await expect(
      service.login({
        email: 'SUPPLIER@example.com',
        password: 'secret-123',
        supplierOrganizationId: 'org-1',
      }),
    ).resolves.toMatchObject({
      accessToken: 'supplier-token',
      expiresInSeconds: 900,
      supplierOrganization: {
        id: 'org-1',
        verificationStatus: 'VERIFIED',
      },
      membership: {
        id: 'membership-1',
        role: 'ADMIN',
      },
    });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'supplier@example.com' } }),
    );
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("sm.status='ACTIVE'"),
      'user-1',
      'org-1',
    );
    expect(String(queryRawUnsafe.mock.calls[0]?.[0] ?? '')).toContain(
      "so.status='ACTIVE'",
    );
    expect(signAsync).toHaveBeenCalledWith(
      {
        tokenType: 'supplier_portal',
        sub: 'user-1',
        supplierOrganizationId: 'org-1',
        supplierMembershipId: 'membership-1',
        supplierRole: 'ADMIN',
      },
      {
        audience: 'supplier-portal',
        expiresIn: 900,
      },
    );
  });
});
