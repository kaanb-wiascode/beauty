import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';

import { PrismaService } from '@beauty-erp/database';
import { SupplierInvitationService } from './supplier-invitation.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('SupplierInvitationService', () => {
  it('stores only a hash of the one-time acceptance token', async () => {
    const executeRawUnsafe = jest.fn().mockResolvedValue(1);
    const tx = { $executeRawUnsafe: executeRawUnsafe };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new SupplierInvitationService(prisma);

    const result = await service.createInvitation(
      {
        sub: 'user-1',
        tokenType: 'supplier_portal',
        supplierOrganizationId: 'org-1',
        supplierMembershipId: 'membership-1',
        supplierRole: 'ADMIN',
      },
      { email: 'Test@Example.com', role: 'MEMBER', expiresInHours: 24 },
    );

    expect(result.email).toBe('test@example.com');
    expect(result.acceptanceToken).toBeTruthy();
    const flattenedArgs = executeRawUnsafe.mock.calls.flat().map(String);
    expect(flattenedArgs).not.toContain(result.acceptanceToken);
    expect(flattenedArgs).toContain(sha256(result.acceptanceToken));
  });

  it('rejects an invalid or expired invitation before touching users', async () => {
    const queryRawUnsafe = jest.fn().mockResolvedValue([]);
    const tx = {
      $queryRawUnsafe: queryRawUnsafe,
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new SupplierInvitationService(prisma);

    await expect(
      service.acceptInvitation({
        token: 'x'.repeat(48),
        password: 'strong-password',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('consumes the invitation and activates membership atomically', async () => {
    const passwordHash = await argon2.hash('strong-password');
    const queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'invite-1',
          supplierOrganizationId: 'org-1',
          email: 'member@example.com',
          role: 'ADMIN',
          invitedByUserId: 'owner-1',
        },
      ])
      .mockResolvedValueOnce([{ membershipId: 'membership-2' }]);
    const tx = {
      $queryRawUnsafe: queryRawUnsafe,
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-2', passwordHash }),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new SupplierInvitationService(prisma);

    await expect(
      service.acceptInvitation({
        token: 'y'.repeat(48),
        password: 'strong-password',
        firstName: 'Grace',
        lastName: 'Hopper',
      }),
    ).resolves.toEqual({
      supplierOrganizationId: 'org-1',
      supplierMembershipId: 'membership-2',
      role: 'ADMIN',
    });

    const sql = String(queryRawUnsafe.mock.calls[1]?.[0] ?? '');
    expect(sql).toContain("SET status='ACCEPTED'");
    expect(sql).toContain('INSERT INTO supplier_memberships');
    expect(sql).toContain('INSERT INTO supplier_membership_audit_logs');
    expect(sql).toContain('INSERT INTO supplier_invitation_audit_logs');
  });
});
