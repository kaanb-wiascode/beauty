import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CareEventsService } from './care-events.service';

describe('CareEventsService organization scope', () => {
  const customerFindFirst = jest.fn();
  const careEventFindMany = jest.fn();

  const prisma = {
    customer: {
      findFirst: customerFindFirst,
    },
    customerCareEvent: {
      findMany: careEventFindMany,
    },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn(() => 'tenant-1'),
  } as unknown as TenantContext;

  const organizationScope = {
    getBranchScopedWhere: jest.fn(async () => ({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-a'] },
    })),
  } as unknown as OrganizationScopeService;

  const service = new CareEventsService(
    prisma,
    tenantContext,
    organizationScope,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (organizationScope.getBranchScopedWhere as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-a'] },
    });
  });

  it('rejects care-event reads for a customer outside effective scope', async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(service.findAll('customer-outside')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(careEventFindMany).not.toHaveBeenCalled();
  });

  it('uses the scoped customer branch for care-event reads', async () => {
    customerFindFirst.mockResolvedValue({
      id: 'customer-1',
      branchId: 'branch-a',
    });
    careEventFindMany.mockResolvedValue([]);

    await service.findAll('customer-1');

    expect(customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        tenantId: 'tenant-1',
        branchId: { in: ['branch-a'] },
      },
      select: {
        id: true,
        branchId: true,
      },
    });
    expect(careEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          customerId: 'customer-1',
          branchId: 'branch-a',
        },
      }),
    );
  });
});
