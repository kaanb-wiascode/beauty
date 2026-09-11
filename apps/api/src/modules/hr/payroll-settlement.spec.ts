import { BadRequestException } from '@nestjs/common';
import { PayrollSettlementService } from './payroll-settlement.service';

describe('PayrollSettlementService',()=>{
  const tenant:any={getTenantId:()=> 'tenant-1',getCompanyId:()=> 'company-1',getBranchId:()=> 'branch-1'};

  it('rejects salary payment above remaining net payable before creating a journal',async()=>{
    const tx:any={
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{id:'period-1',status:'POSTED',branchId:'branch-1',netAmount:'1000'}])
        .mockResolvedValueOnce([{paid:'800'}]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant);
    await expect(service.paySalary('period-1','staff-1',250,'BANK','user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects liability payment above remaining tax payable',async()=>{
    const tx:any={
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{id:'period-1',status:'POSTED',branchId:'branch-1'}])
        .mockResolvedValueOnce([{tax:'500',social:'1000',other:'0'}])
        .mockResolvedValueOnce([{paid:'450'}]),
      chartOfAccount:{findFirst:jest.fn()},
      journalEntry:{create:jest.fn()},
    };
    const prisma:any={$transaction:(fn:any)=>fn(tx)};
    const service=new PayrollSettlementService(prisma,tenant);
    await expect(service.settleLiability('period-1','TAX',100,'BANK','user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});
