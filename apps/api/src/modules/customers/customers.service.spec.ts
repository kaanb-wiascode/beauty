import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CustomersService } from './customers.service';

describe('CustomersService organization scope', () => {
  const customerFindFirst = jest.fn();
  const customerFindMany = jest.fn();
  const customerCount = jest.fn();
  const customerUpdate = jest.fn();

  const prisma = {
    customer: {
      findFirst: customerFindFirst,
      findMany: customerFindMany,
      count: customerCount,
      update: customerUpdate,
    },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getBranchId: jest.fn(() => null),
  } as unknown as TenantContext;

  const organizationScope = {
    getBranchScopedWhere: jest.fn(async () => ({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-a', 'branch-b'] },
    })),
  } as unknown as OrganizationScopeService;

  const service = new CustomersService(
    prisma,
    tenantContext,
    organizationScope,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (organizationScope.getBranchScopedWhere as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
  });

  it('applies assigned branch scope when listing customers', async () => {
    customerFindMany.mockResolvedValue([]);
    customerCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 } as never);

    expect(customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: { in: ['branch-a', 'branch-b'] },
        }),
      }),
    );
    expect(customerCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        branchId: { in: ['branch-a', 'branch-b'] },
      }),
    });
  });

  it('returns not found for a customer outside the effective organization scope', async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(service.findOne('customer-outside')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(customerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'customer-outside',
          tenantId: 'tenant-1',
          branchId: { in: ['branch-a', 'branch-b'] },
        },
      }),
    );
  });

  it('blocks updates before mutation when customer is outside scope', async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(
      service.update('customer-outside', { firstName: 'Blocked' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it('blocks health profile access before upsert when customer is outside scope', async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(
      service.updateHealthProfile('customer-outside', { notes: 'secret' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
