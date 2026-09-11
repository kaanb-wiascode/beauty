import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService', () => {
  const findFirst = jest.fn();
  const prisma = {
    branch: {
      findFirst,
    },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn(),
    getCompanyId: jest.fn(),
    getBranchId: jest.fn(),
  } as unknown as TenantContext;

  const service = new MarketplaceService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(tenantContext.getTenantId).mockReturnValue('tenant-1');
    jest.mocked(tenantContext.getCompanyId).mockReturnValue('company-1');
    jest.mocked(tenantContext.getBranchId).mockReturnValue('branch-1');
  });

  it('requires a selected branch before querying marketplace data', async () => {
    jest.mocked(tenantContext.getBranchId).mockReturnValue(null);

    await expect(service.previewCurrentBranch()).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects when no active branch matches the tenant and company scope', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.previewCurrentBranch()).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'branch-1',
        companyId: 'company-1',
        status: 'ACTIVE',
        company: {
          tenantId: 'tenant-1',
          status: 'ACTIVE',
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        phone: true,
        email: true,
        company: {
          select: {
            id: true,
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

  it('returns only the safe preview projection and keeps publication disabled', async () => {
    const services = [
      {
        id: 'service-1',
        name: 'Cilt Bakımı',
        description: 'Bakım açıklaması',
        durationMinutes: 60,
        price: 1500,
      },
    ];

    findFirst.mockResolvedValue({
      id: 'branch-1',
      name: 'Kadıköy',
      code: 'KDK',
      address: 'İstanbul',
      phone: '+90 212 000 00 00',
      email: 'branch@example.com',
      company: {
        id: 'company-1',
        name: 'VALOO Demo',
        slug: 'valoo-demo',
      },
      services,
    });

    await expect(service.previewCurrentBranch()).resolves.toEqual({
      listing: {
        company: {
          id: 'company-1',
          name: 'VALOO Demo',
          slug: 'valoo-demo',
        },
        branch: {
          id: 'branch-1',
          name: 'Kadıköy',
          code: 'KDK',
          address: 'İstanbul',
          phone: '+90 212 000 00 00',
          email: 'branch@example.com',
        },
        services,
      },
      publication: {
        status: 'PREVIEW_ONLY',
        public: false,
      },
    });
  });
});
