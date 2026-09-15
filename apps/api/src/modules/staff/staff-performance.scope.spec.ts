import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { StaffService } from './staff.service';

describe('StaffService performance scope', () => {
  function createService(context: {
    tenantId: string;
    companyId: string;
    branchId: string | null;
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
  }) {
    const prisma = {
      staff: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const tenantContext = {
      getTenantId: () => context.tenantId,
      getCompanyId: () => context.companyId,
      getBranchId: () => context.branchId,
      getRoleScope: () => context.roleScope,
    } as TenantContext;

    return { prisma, service: new StaffService(prisma, tenantContext) };
  }

  const input = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.999Z'),
  };

  it('keeps branch-scoped reports inside tenant and selected branch', async () => {
    const { prisma, service } = createService({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchId: 'branch-a',
      roleScope: 'BRANCH',
    });

    await service.performance(input);

    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', branchId: 'branch-a' },
      }),
    );
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          startAt: { gte: input.from, lte: input.to },
        }),
      }),
    );
  });

  it('keeps central no-branch reports inside tenant and company branches', async () => {
    const { prisma, service } = createService({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchId: null,
      roleScope: 'CENTRAL',
    });

    await service.performance(input);

    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branch: { companyId: 'company-a' },
        },
      }),
    );
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          branch: { companyId: 'company-a' },
          startAt: { gte: input.from, lte: input.to },
        }),
      }),
    );
  });
});
