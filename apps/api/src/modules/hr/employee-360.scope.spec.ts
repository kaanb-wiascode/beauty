import { NotFoundException } from '@nestjs/common';
import { Employee360Service } from './employee-360.service';

describe('Employee360Service organization scope', () => {
  const organizationScope = {
    getBranchScopedWhere: jest.fn(),
  } as any;
  const fieldSecurity = {
    canRead: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    fieldSecurity.canRead.mockResolvedValue(true);
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
    const service = new Employee360Service(prisma, organizationScope, fieldSecurity);

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
    const service = new Employee360Service(prisma, organizationScope, fieldSecurity);

    await service.get('staff-a', true);

    expect(fieldSecurity.canRead).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(9);
    for (const call of query.mock.calls) {
      expect(call.slice(1)).toContainEqual(['branch-a', 'branch-b']);
      expect(String(call[0])).toContain('ANY($3::text[])');
    }
  });

  it('masks compensation and skips payroll queries when field policy denies compensation access', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a'] },
    });
    fieldSecurity.canRead
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const query = jest.fn().mockResolvedValue([]);
    query.mockResolvedValueOnce([{
      personnelNumber: 'P-1',
      identityNumber: '11111111111',
      iban: 'TR0001',
      grossSalary: '50000',
      salaryType: 'MONTHLY',
    }]);
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
    const service = new Employee360Service(prisma, organizationScope, fieldSecurity);

    const result = await service.get('staff-a', true);

    expect(query).toHaveBeenCalledTimes(7);
    expect(result.employee).toEqual(expect.objectContaining({
      identityNumber: '11111111111',
      iban: 'TR0001',
    }));
    expect(result.employee).not.toHaveProperty('grossSalary');
    expect(result.employee).not.toHaveProperty('salaryType');
    expect(result.payroll).toBeUndefined();
    expect(result.fieldAccess).toEqual({
      identityBanking: true,
      compensationPayroll: false,
    });
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
    const service = new Employee360Service(prisma, organizationScope, fieldSecurity);

    await service.get('staff-a');

    expect(fieldSecurity.canRead).not.toHaveBeenCalled();
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'staff-a', null]);
  });
});
