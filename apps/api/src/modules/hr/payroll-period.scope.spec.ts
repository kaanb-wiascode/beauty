import { BadRequestException } from '@nestjs/common';
import { PayrollPeriodService } from './payroll-period.service';

describe('PayrollPeriodService organization scope', () => {
  const tenant:any = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
    getBranchId: jest.fn(() => 'branch-1'),
  };
  const scope:any = { getBranchScopedWhere: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    tenant.getBranchId.mockReturnValue('branch-1');
  });

  it('creates a branch payroll period only inside assigned scope', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branchId:{ in:['branch-1','branch-2'] } });
    const prisma:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ company_id:'company-1', branch_id:'branch-1' }]) };
    const service = new PayrollPeriodService(prisma, tenant, scope);

    await service.create(2026, 9);

    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual(['tenant-1','company-1','branch-1',2026,9]);
  });

  it('requires an explicit branch for restricted multi-branch scope', async () => {
    tenant.getBranchId.mockReturnValue(null);
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branchId:{ in:['branch-1','branch-2'] } });
    const prisma:any = { $queryRawUnsafe: jest.fn() };
    const service = new PayrollPeriodService(prisma, tenant, scope);

    await expect(service.create(2026, 9)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('keeps CENTRAL no-branch payroll periods company-wide', async () => {
    tenant.getBranchId.mockReturnValue(null);
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branch:{ companyId:'company-1' } });
    const prisma:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ company_id:'company-1', branch_id:null }]) };
    const service = new PayrollPeriodService(prisma, tenant, scope);

    await service.create(2026, 9);

    expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull();
  });

  it('rejects an existing same-month period owned by another branch', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branchId:'branch-1' });
    const prisma:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ company_id:'company-1', branch_id:'branch-2' }]) };
    const service = new PayrollPeriodService(prisma, tenant, scope);

    await expect(service.create(2026, 9)).rejects.toThrow('Payroll period belongs to another branch.');
  });
});
