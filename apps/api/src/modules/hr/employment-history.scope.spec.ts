import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploymentHistoryService } from './employment-history.service';

describe('EmploymentHistoryService organization scope', () => {
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

  it('filters employment history to assigned branches', async () => {
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          branchId: 'branch-a',
          status: 'ACTIVE',
          branch: { companyId: 'company-a' },
        }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new EmploymentHistoryService(prisma, tenant, organizationScope);

    await service.list('staff-a');

    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain(
      'h.branch_id=ANY($3::text[])',
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
    const service = new EmploymentHistoryService(prisma, tenant, organizationScope);

    await expect(service.list('staff-outside')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('blocks branch changes outside the organization assignment workflow', async () => {
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          branchId: 'branch-a',
          status: 'ACTIVE',
          branch: { companyId: 'company-a' },
        }),
      },
      branch: { findFirst: jest.fn() },
    } as any;
    const service = new EmploymentHistoryService(prisma, tenant, organizationScope);

    await expect(
      service.record('staff-a', { eventType: 'OTHER', branchId: 'branch-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('validates the active company before recording an employment event', async () => {
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          branchId: 'branch-a',
          status: 'ACTIVE',
          branch: { companyId: 'company-a' },
        }),
      },
      branch: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new EmploymentHistoryService(prisma, tenant, organizationScope);

    await expect(
      service.record('staff-a', { eventType: 'OTHER', branchId: 'branch-a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps CENTRAL history company-wide', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branch: { companyId: 'company-a' },
    });
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          branchId: 'branch-a',
          status: 'ACTIVE',
          branch: { companyId: 'company-a' },
        }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const service = new EmploymentHistoryService(prisma, tenant, organizationScope);

    await service.list('staff-a');

    expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull();
  });
});
