import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { PlatformReadModelService } from './platform-read-model.service';

describe('PlatformReadModelService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const service = new PlatformReadModelService(prisma);

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('returns command-center counts and recent tenants', async () => {
    const counts = {
      tenantCount: 3,
      companyCount: 4,
      activeCompanyCount: 3,
      branchCount: 8,
      activeBranchCount: 7,
      activeMembershipCount: 22,
    };
    const recentTenants = [
      {
        id: 'tenant-1',
        name: 'Tenant One',
        slug: 'tenant-one',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        activeMembershipCount: 5,
        activeBranchCount: 2,
      },
    ];

    queryRaw.mockResolvedValueOnce([counts]).mockResolvedValueOnce(recentTenants);

    await expect(service.getCommandCenter()).resolves.toEqual({
      counts,
      recentTenants,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns a paginated tenant list without leaking the window count', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'tenant-1',
        name: 'Tenant One',
        slug: 'tenant-one',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        updatedAt: new Date('2026-09-15T00:00:00.000Z'),
        companyCount: 1,
        activeCompanyCount: 1,
        branchCount: 2,
        activeBranchCount: 2,
        activeMembershipCount: 5,
        ownerCount: 1,
        totalCount: 17,
      },
    ]);

    const result = await service.listTenants({
      search: 'tenant',
      limit: 500,
      offset: -10,
    });

    expect(result.pagination).toEqual({ total: 17, limit: 100, offset: 0 });
    expect(result.items[0]).not.toHaveProperty('totalCount');
  });

  it('throws when Tenant 360 target does not exist', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(service.getTenant360('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns Tenant 360 organization and membership breakdowns', async () => {
    const tenant = {
      id: 'tenant-1',
      name: 'Tenant One',
      slug: 'tenant-one',
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
      companyCount: 1,
      activeCompanyCount: 1,
      branchCount: 2,
      activeBranchCount: 2,
      activeMembershipCount: 5,
      ownerCount: 1,
    };
    const companies = [
      {
        id: 'company-1',
        name: 'Company One',
        slug: 'company-one',
        status: 'ACTIVE',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        updatedAt: new Date('2026-09-15T00:00:00.000Z'),
        branchCount: 2,
        activeBranchCount: 2,
      },
    ];
    const membershipBreakdown = [
      { role: 'OWNER', status: 'ACTIVE', count: 1 },
      { role: 'STAFF', status: 'ACTIVE', count: 4 },
    ];

    queryRaw
      .mockResolvedValueOnce([tenant])
      .mockResolvedValueOnce(companies)
      .mockResolvedValueOnce(membershipBreakdown);

    await expect(service.getTenant360('tenant-1')).resolves.toEqual({
      tenant,
      companies,
      membershipBreakdown,
    });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});
