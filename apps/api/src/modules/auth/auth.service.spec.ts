import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService context switch isolation', () => {
  const findFirstMembership = jest.fn();
  const findFirstBranch = jest.fn();
  const signAsync = jest.fn();
  const redis = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
  const prisma = {
    membership: { findFirst: findFirstMembership },
    branch: { findFirst: findFirstBranch },
  } as any;
  const jwtService = { signAsync } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    signAsync.mockResolvedValue('access-token');
  });

  function service() {
    return new AuthService(prisma, jwtService, redis as any);
  }

  const membership = {
    id: 'membership-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    roleId: 'role-1',
    status: 'ACTIVE',
    company: { id: 'company-1', name: 'Company', slug: 'company' },
    tenant: { id: 'tenant-1', name: 'Tenant', slug: 'tenant' },
    role: { id: 'role-1', slug: 'owner', scope: 'COMPANY' },
    branchAccesses: [
      { branchId: 'branch-1', branch: { id: 'branch-1', name: 'Branch 1', code: 'B1' } },
    ],
    user: { id: 'user-1' },
  };

  it('rejects a branch from another company before issuing tokens', async () => {
    findFirstMembership.mockResolvedValue(membership);
    findFirstBranch.mockResolvedValue(null);

    await expect(
      service().switchContext('membership-1', 'branch-other-company', 'user-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findFirstBranch).toHaveBeenCalledWith({
      where: {
        id: 'branch-other-company',
        companyId: 'company-1',
        status: 'ACTIVE',
      },
      select: { id: true, name: true, code: true },
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects an unauthorized branch even when it belongs to the company', async () => {
    findFirstMembership.mockResolvedValue(membership);
    findFirstBranch.mockResolvedValue({
      id: 'branch-2',
      name: 'Branch 2',
      code: 'B2',
    });

    await expect(
      service().switchContext('membership-1', 'branch-2', 'user-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(signAsync).not.toHaveBeenCalled();
  });
});
