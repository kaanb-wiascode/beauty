import { NotFoundException } from '@nestjs/common';
import { PayrollWorkInputService } from './payroll-work-input.service';

describe('PayrollWorkInputService organization scope', () => {
  const tenant:any = { getTenantId:()=> 'tenant-1', getCompanyId:()=> 'company-1' };
  const scope:any = { getBranchScopedWhere: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('uses assigned branch ids for COMPANY payroll preview', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branchId:{ in:['branch-1','branch-2'] } });
    const prisma:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new PayrollWorkInputService(prisma, tenant, scope);

    await service.preview(2026, 9);

    const [sql, tenantId, companyId, branchIds] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('s."branchId"=ANY($3::text[])');
    expect(tenantId).toBe('tenant-1');
    expect(companyId).toBe('company-1');
    expect(branchIds).toEqual(['branch-1','branch-2']);
  });

  it('keeps CENTRAL no-branch preview company-wide', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branch:{ companyId:'company-1' } });
    const prisma:any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new PayrollWorkInputService(prisma, tenant, scope);

    await service.preview(2026, 9);

    expect(prisma.$queryRawUnsafe.mock.calls[0][3]).toBeNull();
  });

  it('rejects a draft payroll item outside assigned branches', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId:'tenant-1', branchId:{ in:['branch-1'] } });
    const tx:any = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id:'period-1', year:2026, month:9, status:'DRAFT', branchId:null }])
        .mockResolvedValueOnce([]),
    };
    const prisma:any = { $transaction: (fn:any)=>fn(tx) };
    const service = new PayrollWorkInputService(prisma, tenant, scope);

    await expect(service.attachToDraft('period-1','staff-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRawUnsafe.mock.calls[1][0]).toContain('branch_id=ANY($5::text[])');
    expect(tx.$queryRawUnsafe.mock.calls[1][5]).toEqual(['branch-1']);
  });
});
