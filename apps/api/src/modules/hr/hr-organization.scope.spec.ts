import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HrOrganizationService } from './hr-organization.service';

describe('HrOrganizationService organization scope', () => {
  const tenant = {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
  } as any;

  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
  });

  it('filters employee assignment history to assigned branches', async () => {
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: 'staff-a' }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await service.employeeHistory('staff-a');

    expect(prisma.staff.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'staff-a',
        tenantId: 'tenant-a',
        branchId: { in: ['branch-a', 'branch-b'] },
      },
      select: { id: true },
    });
    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain(
      'a.branch_id=ANY($3::text[])',
    );
    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'staff-a',
      ['branch-a', 'branch-b'],
    ]);
  });

  it('returns not found for staff outside assigned organization scope', async () => {
    const prisma = {
      staff: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRawUnsafe: jest.fn(),
    } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await expect(service.employeeHistory('staff-outside')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('blocks assignment moves to an unassigned branch', async () => {
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          branchId: 'branch-a',
          branch: { companyId: 'company-a' },
        }),
      },
      branch: { findFirst: jest.fn() },
    } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await expect(
      service.assign('staff-a', { branchId: 'branch-outside' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('blocks managers outside assigned organization scope', async () => {
    const prisma = {
      staff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'staff-a',
            branchId: 'branch-a',
            branch: { companyId: 'company-a' },
          })
          .mockResolvedValueOnce(null),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-a',
          companyId: 'company-a',
        }),
      },
      $queryRawUnsafe: jest.fn(),
    } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await expect(
      service.assign('staff-a', { managerStaffId: 'manager-outside' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents organization metadata creation in another company', async () => {
    const prisma = { $queryRawUnsafe: jest.fn() } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await expect(
      service.createDepartment({ companyId: 'company-b', code: 'OPS', name: 'Ops' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('keeps CENTRAL organization scope company-wide', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branch: { companyId: 'company-a' },
    });
    const prisma = {
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a' }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new HrOrganizationService(prisma, tenant, organizationScope);

    await service.employeeHistory('staff-a');

    expect(prisma.staff.findFirst).toHaveBeenCalledWith({
      where: { id: 'staff-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull();
  });
});
