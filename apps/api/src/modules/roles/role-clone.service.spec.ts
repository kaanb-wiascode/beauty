import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { RoleCloneService } from './role-clone.service';

describe('RoleCloneService', () => {
  const roleFindFirst = jest.fn();
  const membershipFindFirst = jest.fn();
  const roleCreate = jest.fn();
  const roleFindUnique = jest.fn();
  const rolePermissionCreateMany = jest.fn();
  const auditRecord = jest.fn();
  const transaction = jest.fn();

  const tx = {
    role: {
      create: roleCreate,
      findUnique: roleFindUnique,
    },
    rolePermission: {
      createMany: rolePermissionCreateMany,
    },
  };

  const prisma = {
    role: { findFirst: roleFindFirst },
    membership: { findFirst: membershipFindFirst },
    $transaction: transaction,
  } as unknown as PrismaService;

  const tenantContext = {
    getContext: () => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      membershipId: 'membership-admin',
      branchId: null,
      roleScope: 'CENTRAL',
    }),
  } as unknown as TenantContext;

  const audit = { record: auditRecord } as unknown as PlatformAuditService;
  const service = new RoleCloneService(prisma, tenantContext, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    membershipFindFirst.mockResolvedValue({ userId: 'admin-user' });
    roleCreate.mockResolvedValue({
      id: 'role-copy',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      name: 'Assistant Manager',
      slug: 'assistant-manager',
      description: null,
      scope: 'COMPANY',
    });
    roleFindUnique.mockResolvedValue({
      id: 'role-copy',
      name: 'Assistant Manager',
      slug: 'assistant-manager',
      scope: 'COMPANY',
      rolePermissions: [],
      _count: { memberships: 0, rolePermissions: 2 },
    });
    rolePermissionCreateMany.mockResolvedValue({ count: 2 });
    auditRecord.mockResolvedValue({ id: 'audit-1' });
  });

  it('copies permissions only from a source role in the active company', async () => {
    roleFindFirst
      .mockResolvedValueOnce({
        id: 'source-role',
        slug: 'branch-manager',
        description: 'Branch manager',
        scope: 'COMPANY',
        rolePermissions: [
          { permissionId: 'permission-1' },
          { permissionId: 'permission-2' },
        ],
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.clone('source-role', { name: 'Assistant Manager' }),
    ).resolves.toMatchObject({ id: 'role-copy' });

    expect(roleFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'source-role',
          tenantId: 'tenant-1',
          companyId: 'company-1',
        }),
      }),
    );
    expect(rolePermissionCreateMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'role-copy', permissionId: 'permission-1' },
        { roleId: 'role-copy', permissionId: 'permission-2' },
      ],
      skipDuplicates: true,
    });
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it('does not expose a role from another company', async () => {
    roleFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.clone('foreign-role', { name: 'Copy' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('blocks cloning the owner role', async () => {
    roleFindFirst.mockResolvedValueOnce({
      id: 'owner-role',
      slug: 'owner',
      description: 'Owner',
      scope: 'CENTRAL',
      rolePermissions: [],
    });

    await expect(
      service.clone('owner-role', { name: 'Owner Copy' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });
});
