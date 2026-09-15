import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { InvitationService } from './invitation.service';

describe('InvitationService', () => {
  const roleFindFirst = jest.fn();
  const branchFindMany = jest.fn();
  const membershipFindFirst = jest.fn();
  const userFindUnique = jest.fn();
  const executeRaw = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const auditRecord = jest.fn();

  const tx = {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
  };

  const prisma = {
    role: { findFirst: roleFindFirst },
    branch: { findMany: branchFindMany },
    membership: { findFirst: membershipFindFirst },
    user: { findUnique: userFindUnique },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;

  const audit = { record: auditRecord } as unknown as PlatformAuditService;
  const service = new InvitationService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    roleFindFirst.mockResolvedValue({
      id: 'role-1',
      name: 'Manager',
      slug: 'manager',
      scope: 'COMPANY',
    });
    membershipFindFirst.mockResolvedValue({ userId: 'admin-user-1' });
    userFindUnique.mockResolvedValue(null);
    branchFindMany.mockResolvedValue([]);
    executeRaw.mockResolvedValue(1);
    auditRecord.mockResolvedValue({ id: 'audit-1' });
  });

  it('rejects explicit branch assignments for CENTRAL roles', async () => {
    roleFindFirst.mockResolvedValue({
      id: 'role-central',
      name: 'Central Admin',
      slug: 'central-admin',
      scope: 'CENTRAL',
    });

    await expect(
      service.create(
        {
          email: 'admin@example.com',
          roleId: '00000000-0000-4000-8000-000000000001',
          branchIds: ['00000000-0000-4000-8000-000000000002'],
          expiresInHours: 72,
        },
        {
          tenantId: 'tenant-1',
          companyId: 'company-1',
          actorMembershipId: 'membership-1',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('persists only a hash of the one-time invitation token', async () => {
    const result = await service.create(
      {
        email: 'new.user@example.com',
        roleId: '00000000-0000-4000-8000-000000000001',
        branchIds: [],
        expiresInHours: 24,
      },
      {
        tenantId: 'tenant-1',
        companyId: 'company-1',
        actorMembershipId: 'membership-1',
      },
    );

    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThan(32);
    expect(executeRaw).toHaveBeenCalledTimes(2);

    const serializedSqlCalls = JSON.stringify(executeRaw.mock.calls);
    expect(serializedSqlCalls).not.toContain(result.token);
    expect(serializedSqlCalls).toMatch(/[a-f0-9]{64}/);
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });
});
