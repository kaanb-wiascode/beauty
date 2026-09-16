import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from './organization-scope.service';
import { TenantContext } from './tenant-context';

describe('OrganizationScopeService', () => {
  const findMany = jest.fn();
  const prisma = {
    membershipBranchAccess: {
      findMany,
    },
  } as unknown as PrismaService;

  function createContext(input: {
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    branchId: string | null;
  }) {
    const tenantContext = new TenantContext();
    tenantContext.setContext({
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      companyId: 'company-1',
      branchId: input.branchId,
      roleScope: input.roleScope,
    });
    return tenantContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('narrows every role scope to the explicitly selected branch', async () => {
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'CENTRAL', branchId: 'branch-1' }),
    );

    await expect(service.getBranchScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('allows CENTRAL scope to read the active company context when no branch is selected', async () => {
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'CENTRAL', branchId: null }),
    );

    await expect(service.getBranchScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      branch: {
        companyId: 'company-1',
      },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('limits COMPANY scope to explicitly assigned active branches', async () => {
    findMany.mockResolvedValue([
      { branchId: 'branch-1' },
      { branchId: 'branch-2' },
    ]);
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'COMPANY', branchId: null }),
    );

    await expect(service.getBranchScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      branchId: {
        in: ['branch-1', 'branch-2'],
      },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        membershipId: 'membership-1',
        branch: {
          companyId: 'company-1',
          status: 'ACTIVE',
        },
      },
      select: {
        branchId: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  });

  it('denies stale BRANCH scope without a selected branch', async () => {
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'BRANCH', branchId: null }),
    );

    await expect(service.getBranchScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      branchId: {
        in: [],
      },
    });
  });

  it('maps selected branch scope through the payment appointment relation', async () => {
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'BRANCH', branchId: 'branch-1' }),
    );

    await expect(service.getPaymentScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      appointment: {
        branchId: 'branch-1',
      },
    });
  });

  it('maps COMPANY assignments through the payment appointment relation', async () => {
    findMany.mockResolvedValue([
      { branchId: 'branch-1' },
      { branchId: 'branch-2' },
    ]);
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'COMPANY', branchId: null }),
    );

    await expect(service.getPaymentScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      appointment: {
        branchId: {
          in: ['branch-1', 'branch-2'],
        },
      },
    });
  });

  it('maps CENTRAL company scope through the payment appointment relation', async () => {
    const service = new OrganizationScopeService(
      prisma,
      createContext({ roleScope: 'CENTRAL', branchId: null }),
    );

    await expect(service.getPaymentScopedWhere()).resolves.toEqual({
      tenantId: 'tenant-1',
      appointment: {
        branch: {
          companyId: 'company-1',
        },
      },
    });
  });
});
