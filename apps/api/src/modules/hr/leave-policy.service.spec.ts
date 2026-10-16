import { ConflictException } from '@nestjs/common';
import { LeavePolicyService } from './leave-policy.service';

describe('LeavePolicyService',()=>{
  const ctx={getTenantId:()=> 'tenant-1',getCompanyId:()=> 'company-1'} as any;
  const org={getBranchScopedWhere:jest.fn().mockResolvedValue({branchId:{in:['branch-1']}})} as any;
  it('rejects malformed request dates before persistence',async()=>{
    const service=new LeavePolicyService({} as any,ctx,org);
    await expect(service.request('staff-1',{leaveTypeId:'type-1',startDate:'bad',endDate:'2026-09-10',days:1})).rejects.toThrow('startDate must be YYYY-MM-DD');
  });
  it('rejects requests spanning entitlement years',async()=>{
    const service=new LeavePolicyService({} as any,ctx,org);
    await expect(service.request('staff-1',{leaveTypeId:'type-1',startDate:'2026-12-31',endDate:'2027-01-02',days:2})).rejects.toThrow('cannot span entitlement years');
  });
  it('rejects unsupported review states',async()=>{
    const service=new LeavePolicyService({} as any,ctx,org);
    await expect(service.review('request-1','PAID')).rejects.toThrow('APPROVED or REJECTED');
  });
  it('blocks insufficient balances before opening a transaction',async()=>{
    const prisma:any={staff:{findFirst:jest.fn().mockResolvedValue({id:'staff-1',branchId:'branch-1'})},$queryRawUnsafe:jest.fn().mockResolvedValue([{id:'policy-1',allow_negative:false,max_negative:'0'}])};
    const service=new LeavePolicyService(prisma,ctx,org);
    jest.spyOn(service,'ensureEntitlement').mockResolvedValue({id:'ent-1',available:0} as any);
    await expect(service.request('staff-1',{leaveTypeId:'type-1',startDate:'2026-09-10',endDate:'2026-09-10',days:1})).rejects.toBeInstanceOf(ConflictException);
  });
});
