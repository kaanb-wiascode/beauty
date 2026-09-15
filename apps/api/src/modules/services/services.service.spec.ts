import { ServicesService } from './services.service';

describe('ServicesService performance scope', () => {
  function createService(options: {
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
    branchId: string | null;
  }) {
    const prisma = {
      service: {
        findMany: jest.fn().mockResolvedValue([]),
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

    return {
      prisma,
      service: new ServicesService(prisma, tenantContext),
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
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...companyScope,
          startAt: {
            gte: range.from,
            lte: range.to,
          },
        },
      }),
    );
  });
});
