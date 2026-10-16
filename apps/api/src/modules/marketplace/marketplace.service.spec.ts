import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService', () => {
  const findFirst = jest.fn();
  const queryRawUnsafe = jest.fn();
  const prisma = {
    branch: {
      findFirst,
    },
    $queryRawUnsafe: queryRawUnsafe,
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
    expect(queryRawUnsafe).not.toHaveBeenCalled();
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

  it('returns the safe preview projection with persisted publication state', async () => {
    const services = [
      {
        id: 'service-1',
        name: 'Cilt Bakımı',
        description: 'Bakım açıklaması',
        durationMinutes: 60,
        price: 1500,
      },
    ];
    const publishedAt = new Date('2026-09-11T16:00:00.000Z');

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
    queryRawUnsafe.mockResolvedValue([
      {
        id: 'publication-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        status: 'PUBLISHED',
        publishedAt,
        unpublishedAt: null,
        publishedByUserId: 'user-1',
        unpublishedByUserId: null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    ]);

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
        status: 'PUBLISHED',
        public: true,
        publishedAt,
        unpublishedAt: null,
      },
    });
  });

  it('defaults publication status to unpublished when no opt-in row exists', async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await expect(service.publicationStatus()).resolves.toEqual({
      status: 'UNPUBLISHED',
      public: false,
      publishedAt: null,
      unpublishedAt: null,
    });

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM marketplace_publications'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('publishes only after validating the active tenant/company/branch scope', async () => {
    const publishedAt = new Date('2026-09-11T16:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'branch-1' });
    queryRawUnsafe.mockResolvedValue([
      {
        id: 'publication-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        status: 'PUBLISHED',
        publishedAt,
        unpublishedAt: null,
        publishedByUserId: 'user-1',
        unpublishedByUserId: null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    ]);

    await expect(service.publishCurrentBranch('user-1')).resolves.toEqual({
      status: 'PUBLISHED',
      public: true,
      publishedAt,
      unpublishedAt: null,
    });

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
      select: { id: true },
    });
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (branch_id)'),
      expect.any(String),
      'tenant-1',
      'company-1',
      'branch-1',
      'user-1',
    );
  });

  it('unpublishes inside the same organization scope', async () => {
    const publishedAt = new Date('2026-09-11T16:00:00.000Z');
    const unpublishedAt = new Date('2026-09-11T17:00:00.000Z');
    findFirst.mockResolvedValue({ id: 'branch-1' });
    queryRawUnsafe.mockResolvedValue([
      {
        id: 'publication-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        status: 'UNPUBLISHED',
        publishedAt,
        unpublishedAt,
        publishedByUserId: 'user-1',
        unpublishedByUserId: 'user-2',
        createdAt: publishedAt,
        updatedAt: unpublishedAt,
      },
    ]);

    await expect(service.unpublishCurrentBranch('user-2')).resolves.toEqual({
      status: 'UNPUBLISHED',
      public: false,
      publishedAt,
      unpublishedAt,
    });

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status='UNPUBLISHED'"),
      expect.any(String),
      'tenant-1',
      'company-1',
      'branch-1',
      'user-2',
    );
  });
});
