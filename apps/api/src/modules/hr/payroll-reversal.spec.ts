import { BadRequestException } from '@nestjs/common';
import { PayrollReversalService } from './payroll-reversal.service';

describe('PayrollReversalService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('blocks reversal when payroll settlements exist',async()=>{
    const prisma:any={
      $queryRawUnsafe:jest.fn()
        .mockResolvedValueOnce([{id:'period-a',status:'POSTED',branchId:'branch-a'}])
        .mockResolvedValueOnce([{roleSlug:'owner',roleName:'Owner',roleScope:'COMPANY',hasBranchAccess:true}]),
      $transaction:jest.fn(async(fn:any)=>fn({
        $queryRawUnsafe:jest.fn()
          .mockResolvedValueOnce([{id:'period-a',year:2026,month:9,status:'POSTED',branchId:'branch-a',journalEntryId:'je-a'}])
          .mockResolvedValueOnce([{salary_count:1,liability_count:0}]),
      })),
    };
    const service=new PayrollReversalService(prisma,tenant);
    await expect(service.reverse('period-a','user-a','Yanlış bordro kaydı')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate reversal without creating another journal',async()=>{
    const prisma:any={$queryRawUnsafe:jest.fn().mockResolvedValue([{id:'period-a',status:'REVERSED',branchId:'branch-a',reversalJournalEntryId:'je-r'}]),$transaction:jest.fn()};
    const service=new PayrollReversalService(prisma,tenant);
    await expect(service.reverse('period-a','user-a','Tekrar kontrol')).resolves.toEqual({periodId:'period-a',status:'REVERSED',journalEntryId:'je-r',duplicate:true});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow posted payroll to be cancelled',async()=>{
    const prisma:any={$queryRawUnsafe:jest.fn().mockResolvedValue([{id:'period-a',status:'POSTED',branchId:'branch-a'}])};
    const service=new PayrollReversalService(prisma,tenant);
    await expect(service.cancel('period-a','user-a','İptal nedeni')).rejects.toBeInstanceOf(BadRequestException);
  });
});
