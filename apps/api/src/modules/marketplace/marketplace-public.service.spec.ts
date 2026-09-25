import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService public listing', () => {
  const findFirst = jest.fn();
  const queryRawUnsafe = jest.fn();
  const prisma = {
    branch: {
      findFirst,
    },
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
  const tenantContext = {} as TenantContext;
  const service = new MarketplaceService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not read branch data when publication is missing or unpublished', async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await expect(
      service.publicListing('valoo-demo', 'KDK'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("mp.status='PUBLISHED'"),
      'valoo-demo',
      'KDK',
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns only allowlisted public data for an active published branch', async () => {
    queryRawUnsafe.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
      },
    ]);
    findFirst.mockResolvedValue({
      name: 'Kadıköy',
      code: 'KDK',
      address: 'İstanbul',
      phone: '+90 212 000 00 00',
      email: 'branch@example.com',
      company: {
        name: 'VALOO Demo',
        slug: 'valoo-demo',
      },
      services: [
        {
          id: 'service-1',
          name: 'Cilt Bakımı',
          description: 'Bakım açıklaması',
          durationMinutes: 60,
          price: 1500,
        },
      ],
    });

    await expect(
      service.publicListing('valoo-demo', 'KDK'),
    ).resolves.toEqual({
      listing: {
        company: {
          name: 'VALOO Demo',
          slug: 'valoo-demo',
        },
        branch: {
          name: 'Kadıköy',
          code: 'KDK',
          address: 'İstanbul',
          phone: '+90 212 000 00 00',
          email: 'branch@example.com',
        },
        services: [
          {
            id: 'service-1',
            name: 'Cilt Bakımı',
            description: 'Bakım açıklaması',
            durationMinutes: 60,
            price: 1500,
          },
        ],
      },
      publication: {
        status: 'PUBLISHED',
        public: true,
      },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'branch-1',
        companyId: 'company-1',
        code: 'KDK',
        status: 'ACTIVE',
        company: {
          id: 'company-1',
          tenantId: 'tenant-1',
          slug: 'valoo-demo',
          status: 'ACTIVE',
        },
      },
      select: {
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        company: {
          select: {
            name: true,
            slug: true,
          },
        },
        services: {
          where: {
            tenantId: 'tenant-1',
            status: 'ACTIVE',
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
          },
        },
      },
    });
  });
});
