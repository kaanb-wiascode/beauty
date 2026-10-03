import { PrismaService } from '@beauty-erp/database';

import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { StaffService } from './staff.service';

describe('StaffService organization scope', () => {
  function createService(context: {
    tenantId: string;
    companyId: string;
    branchId: string | null;
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    assignedBranchIds?: string[];
  }) {
    const prisma = {
      branch: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      staff: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const tenantContext = {
      getTenantId: () => context.tenantId,
      getCompanyId: () => context.companyId,
      getBranchId: () => context.branchId,
      getRoleScope: () => context.roleScope,
    } as TenantContext;

    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue(
        context.branchId
          ? { tenantId: context.tenantId, branchId: context.branchId }
          : context.roleScope === 'CENTRAL'
            ? {
                tenantId: context.tenantId,
                branch: { companyId: context.companyId },
              }
            : {
                tenantId: context.tenantId,
                branchId: { in: context.assignedBranchIds ?? [] },
              },
      ),
      getAssignedActiveBranchIds: jest
        .fn()
        .mockResolvedValue(context.assignedBranchIds ?? []),
    } as unknown as OrganizationScopeService;

    return {
      prisma,
      organizationScope,
      service: new StaffService(prisma, tenantContext, organizationScope),
    };
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
  });

  it('restricts company no-branch reads to assigned branches', async () => {
    const { prisma, service } = createService({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchId: null,
      roleScope: 'COMPANY',
      assignedBranchIds: ['branch-a', 'branch-b'],
    });

    await service.findAll({ page: 1, limit: 20 } as any);

    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: { in: ['branch-a', 'branch-b'] },
        }),
      }),
    );
  });

  it('creates company-scoped staff only in the single assigned active branch', async () => {
    const { prisma, service } = createService({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchId: null,
      roleScope: 'COMPANY',
      assignedBranchIds: ['branch-a'],
    });

    (prisma.staff.create as jest.Mock).mockResolvedValue({ id: 'staff-a' });

    await service.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
    } as any);

    expect(prisma.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: 'branch-a',
        }),
      }),
    );
    expect(prisma.branch.findMany).not.toHaveBeenCalled();
  });
});
