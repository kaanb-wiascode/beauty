import { NotFoundException } from '@nestjs/common';
import { Employee360Service } from './employee-360.service';

describe('Employee360Service organization scope', () => {
  const organizationScope = {
    getBranchScopedWhere: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not load subordinate HR data when the employee is outside scope', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
    const query = jest.fn();
    const prisma = {
      staff: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRawUnsafe: query,
    } as any;
    const service = new Employee360Service(prisma, organizationScope);

    await expect(service.get('staff-outside', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'staff-outside',
          tenantId: 'tenant-a',
          branchId: { in: ['branch-a'] },
        },
      }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('propagates COMPANY assigned branches to employee history and sensitive reads', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
    const query = jest.fn().mockResolvedValue([]);
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          firstName: 'Ada',
          lastName: 'Yilmaz',
          branchId: 'branch-a',
          profile: {},
          branch: { id: 'branch-a', name: 'A', companyId: 'company-a' },
        }),
      },
      $queryRawUnsafe: query,
    } as any;
    const service = new Employee360Service(prisma, organizationScope);

    await service.get('staff-a', true);

    expect(query).toHaveBeenCalledTimes(9);
    for (const call of query.mock.calls) {
      expect(call.slice(1)).toContainEqual(['branch-a', 'branch-b']);
      expect(String(call[0])).toContain('ANY($3::text[])');
    }
  });

  it('represents CENTRAL company-wide history with a null branch list', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branch: { companyId: 'company-a' },
    });
    const query = jest.fn().mockResolvedValue([]);
    const prisma = {
      staff: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'staff-a',
          firstName: 'Ada',
          lastName: 'Yilmaz',
          branchId: 'branch-a',
          profile: {},
          branch: { id: 'branch-a', name: 'A', companyId: 'company-a' },
        }),
      },
      $queryRawUnsafe: query,
    } as any;
    const service = new Employee360Service(prisma, organizationScope);

    await service.get('staff-a');

    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'staff-a', null]);
  });
});
