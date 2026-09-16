import { NotFoundException } from '@nestjs/common';
import { HrService } from './hr.service';

describe('HrService organization scope', () => {
  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue(null),
  } as any;

  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContext.getBranchId.mockReturnValue(null);
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: { in: ['branch-a', 'branch-b'] },
    });
  });

  it('lists employees from all assigned COMPANY branches', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrService(
      { staff: { findMany }, $queryRawUnsafe: query } as any,
      tenantContext,
      organizationScope,
    );

    await service.employees();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branchId: { in: ['branch-a', 'branch-b'] },
        },
      }),
    );
    expect(String(query.mock.calls[0][0])).toContain(
      'emr.branch_id=ANY($2::text[])',
    );
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      ['branch-a', 'branch-b'],
    ]);
  });

  it('blocks employee updates outside assigned branches', async () => {
    const staffFindFirst = jest.fn().mockResolvedValue(null);
    const staffUpdate = jest.fn();
    const service = new HrService(
      { staff: { findFirst: staffFindFirst, update: staffUpdate } } as any,
      tenantContext,
      organizationScope,
    );

    await expect(service.updateEmployee('staff-outside', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(staffFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'staff-outside',
          tenantId: 'tenant-a',
          branchId: { in: ['branch-a', 'branch-b'] },
        },
      }),
    );
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it('scopes leave mutations with the assigned branch list', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const service = new HrService(
      { $executeRawUnsafe: execute } as any,
      tenantContext,
      organizationScope,
    );

    await service.updateLeave('leave-a', { status: 'APPROVED' });

    expect(String(execute.mock.calls[0][0])).toContain(
      'branch_id=ANY($10::text[])',
    );
    expect(execute.mock.calls[0].at(-1)).toEqual(['branch-a', 'branch-b']);
  });

  it('rejects SGK writes when the staff member is not in the writable branch', async () => {
    tenantContext.getBranchId.mockReturnValue('branch-a');
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branchId: 'branch-a',
    });
    const branchFindFirst = jest.fn().mockResolvedValue({ id: 'branch-a' });
    const staffFindFirst = jest.fn().mockResolvedValue(null);
    const execute = jest.fn();
    const service = new HrService(
      {
        branch: { findFirst: branchFindFirst },
        staff: { findFirst: staffFindFirst },
        $executeRawUnsafe: execute,
      } as any,
      tenantContext,
      organizationScope,
    );

    await expect(
      service.createSgk({ staffId: 'staff-b', year: 2026, month: 9 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(staffFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'staff-b',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
      },
      select: { id: true },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps CENTRAL no-branch reads company-wide through branch relations', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({
      tenantId: 'tenant-a',
      branch: { companyId: 'company-a' },
    });
    const findMany = jest.fn().mockResolvedValue([]);
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrService(
      { staff: { findMany }, $queryRawUnsafe: query } as any,
      tenantContext,
      organizationScope,
    );

    await service.employees();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branch: { companyId: 'company-a' },
        },
      }),
    );
    expect(query.mock.calls[0].at(-1)).toBeNull();
  });
});
