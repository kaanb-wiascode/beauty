import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayrollSettlementService } from './payroll-settlement.service';

describe('PayrollSettlementService',()=>{
  const tenant:any={getTenantId:()=> 'tenant-1',getCompanyId:()=> 'company-1'};
  const scope:any={getBranchScopedWhere:jest.fn()};

  beforeEach(()=>jest.clearAllMocks());

  it('rejects salary payment above remaining net payable before creating a journal',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}});
    const tx:any={
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{id:'period-1',status:'POSTED',branchId:'branch-1',netAmount:'1000'}])
        .mockResolvedValueOnce([{id:'queue-1',amountDue:'1000',amountPaid:'800',remainingAmount:'200',status:'PARTIALLY_PAID'}]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant,scope);
    await expect(service.paySalary('period-1','staff-1',250,'BANK','user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('pi.branch_id=ANY($5::text[])');
    expect(tx.$queryRawUnsafe.mock.calls[0][5]).toEqual(['branch-1']);
  });

  it('rejects zero queue payment amount without posting',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}});
    const query=jest.fn().mockResolvedValueOnce([{id:'queue-1',periodId:'period-1',staffId:'staff-1',remainingAmount:'1000',status:'PENDING'}]);
    const prisma:any={$queryRawUnsafe:query,$transaction:jest.fn()};
    const service=new PayrollSettlementService(prisma,tenant,scope);
    await expect(service.payQueueItem('queue-1',0,'BANK','user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['CANCELLED', '100'],
    ['PENDING', '0'],
    ['PARTIALLY_PAID', '-10'],
    ['PENDING', 'not-a-number'],
  ])('rejects invalid payroll queue state or balance %s/%s', async (status, balance) => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1'] } });
    const tx: any = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: 'period-1', status: 'POSTED', branchId: 'branch-1' }])
        .mockResolvedValueOnce([{ id: 'queue-1', status, remainingAmount: balance }]),
      journalEntry: { create: jest.fn() },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const service = new PayrollSettlementService(prisma, tenant, scope);
    await expect(service.paySalary('period-1', 'staff-1', 10, 'BANK', 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects cancelled queue items before salary posting', async () => {
    scope.getBranchScopedWhere.mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1'] } });
    const prisma: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{
        id: 'queue-1', periodId: 'period-1', staffId: 'staff-1',
        remainingAmount: '500', status: 'CANCELLED',
      }]),
      $transaction: jest.fn(),
    };
    const service = new PayrollSettlementService(prisma, tenant, scope);
    await expect(service.payQueueItem('queue-1', 100, 'BANK', 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects liability payment above remaining tax payable',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}});
    const tx:any={
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{id:'period-1',status:'POSTED',branchId:'branch-1'}])
        .mockResolvedValueOnce([{tax:'500',social:'1000',other:'0'}])
        .mockResolvedValueOnce([{paid:'450'}]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant,scope);
    await expect(service.settleLiability('period-1','TAX',100,'BANK','user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('branch_id=ANY($4::text[])');
  });

  it('does not expose a posted payroll item outside assigned branches',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1','branch-2']}});
    const tx:any={
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant,scope);

    await expect(service.paySalary('period-x','staff-x',100,'BANK','user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRawUnsafe.mock.calls[0][5]).toEqual(['branch-1','branch-2']);
  });

  it('rejects branchless company-wide liability periods for restricted scope',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branchId:{in:['branch-1']}});
    const tx:any={
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant,scope);

    await expect(service.settleLiability('period-global','TAX',100,'BANK','user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).not.toContain('branch_id IS NULL');
  });

  it('keeps CENTRAL no-branch settlement company-wide',async()=>{
    scope.getBranchScopedWhere.mockResolvedValue({tenantId:'tenant-1',branch:{companyId:'company-1'}});
    const tx:any={
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant,scope);

    await expect(service.paySalary('period-x','staff-x',100,'BANK','user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRawUnsafe.mock.calls[0][5]).toBeNull();
  });
});
