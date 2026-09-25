import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '@beauty-erp/database';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard temporary access', () => {
  const membershipFindFirst = jest.fn();
  const branchFindFirst = jest.fn();
  const rolePermissionFindMany = jest.fn();
  const queryRaw = jest.fn();

  const prisma = {
    membership: { findFirst: membershipFindFirst },
    branch: { findFirst: branchFindFirst },
    rolePermission: { findMany: rolePermissionFindMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const user = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    companyId: 'company-1',
    branchId: 'branch-1',
    roleScope: 'COMPANY' as const,
  };

  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce({ resource: 'finance', action: 'read' })
      .mockReturnValueOnce(undefined);
    membershipFindFirst.mockResolvedValue({
      companyId: 'company-1',
      role: { id: 'role-1', companyId: 'company-1', scope: 'COMPANY' },
      branchAccesses: [{ branchId: 'branch-1' }],
    });
    branchFindFirst.mockResolvedValue({ id: 'branch-1' });
    rolePermissionFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([{ resource: 'finance', action: 'read' }]);
  });

  it('allows an active temporary grant when the role lacks the permission', async () => {
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const template = queryRaw.mock.calls[0]?.[0] as TemplateStringsArray;
    const sql = Array.from(template).join(' ');
    expect(sql).toContain('temporary_permission_grants');
    expect(sql).toContain('"revokedAt" IS NULL');
    expect(sql).toContain('"startsAt" <= CURRENT_TIMESTAMP');
    expect(sql).toContain('"endsAt" > CURRENT_TIMESTAMP');
    expect(sql).toContain('"branchId" IS NOT DISTINCT FROM');
  });

  it('denies access when neither role nor active temporary grant provides it', async () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReset()
      .mockReturnValueOnce({ resource: 'finance', action: 'read' })
      .mockReturnValueOnce(undefined);
    queryRaw.mockResolvedValue([]);
    const guard = new PermissionsGuard(reflector, prisma);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
