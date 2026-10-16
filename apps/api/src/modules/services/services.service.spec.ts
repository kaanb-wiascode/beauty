import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { ServicesService } from './services.service';

describe('ServicesService organization scope', () => {
  function createService(options: {
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    branchId: string | null;
    assignedBranchIds?: string[];
  }) {
    const prisma = {
      branch: {
        findFirst: jest.fn(),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(options.branchId),
      getRoleScope: jest.fn().mockReturnValue(options.roleScope),
    } as any;

    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue(
        options.branchId
          ? { tenantId: 'tenant-a', branchId: options.branchId }
          : options.roleScope === 'CENTRAL'
            ? {
                tenantId: 'tenant-a',
                branch: { companyId: 'company-a' },
              }
            : {
                tenantId: 'tenant-a',
                branchId: { in: options.assignedBranchIds ?? [] },
              },
      ),
      getAssignedActiveBranchIds: jest
        .fn()
        .mockResolvedValue(options.assignedBranchIds ?? []),
    } as unknown as OrganizationScopeService;

    return {
      prisma,
      organizationScope,
      service: new ServicesService(
        prisma,
        tenantContext,
        organizationScope,
      ),
    };
  }

  const range = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.999Z'),
  };

  it('restricts branch scoped performance to tenant and active branch', async () => {
    const { service, prisma } = createService({
      roleScope: 'BRANCH',
      branchId: 'branch-a',
    });

    await service.performance(range);

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branchId: 'branch-a',
        },
      }),
    );
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          startAt: {
            gte: range.from,
            lte: range.to,
          },
        },
      }),
    );
  });

  it('restricts central company-wide performance to the authenticated company', async () => {
    const { service, prisma } = createService({
      roleScope: 'CENTRAL',
      branchId: null,
    });

    await service.performance(range);

    const companyScope = {
      tenantId: 'tenant-a',
      branch: {
        companyId: 'company-a',
      },
    };

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: companyScope }),
    );
  });

  it('restricts company reads to assigned active branches', async () => {
    const { service, prisma } = createService({
      roleScope: 'COMPANY',
      branchId: null,
      assignedBranchIds: ['branch-a', 'branch-b'],
    });

    await service.findAll({ page: 1, limit: 20 } as any);

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: { in: ['branch-a', 'branch-b'] },
        }),
      }),
    );
  });

  it('rejects service creation in an unassigned branch for company scope', async () => {
    const { service, prisma } = createService({
      roleScope: 'COMPANY',
      branchId: 'branch-x',
      assignedBranchIds: ['branch-a'],
    });

    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-x' });

    await expect(
      service.create({
        name: 'Hydrafacial',
        durationMinutes: 60,
        price: 1000,
      } as any),
    ).rejects.toThrow('Branch not found');

    expect(prisma.service.create).not.toHaveBeenCalled();
  });
});
