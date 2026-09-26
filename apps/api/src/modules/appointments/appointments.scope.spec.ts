import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService organization scope', () => {
  const findFirst = jest.fn();
  const prisma = {
    appointment: {
      findFirst,
    },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
  } as unknown as TenantContext;

  const getBranchScopedWhere = jest.fn();
  const organizationScope = {
    getBranchScopedWhere,
  } as unknown as OrganizationScopeService;

  const service = new AppointmentsService(
    prisma,
    tenantContext,
    organizationScope,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies the organization scope to appointment id lookups', async () => {
    getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-1', 'branch-2'] },
    });
    findFirst.mockResolvedValue({ id: 'appointment-1' });

    await service.findOne('appointment-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'appointment-1',
          tenantId: 'tenant-1',
          branchId: { in: ['branch-1', 'branch-2'] },
        },
      }),
    );
  });

  it('returns not found when an appointment id is outside the allowed scope', async () => {
    getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: ['branch-1'] },
    });
    findFirst.mockResolvedValue(null);

    await expect(service.findOne('foreign-appointment')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
