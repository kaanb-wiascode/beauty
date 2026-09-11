import { BadRequestException } from '@nestjs/common';
import { QualityService } from './quality.service';

describe('QualityService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('rejects invalid feedback rating before persistence',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()} as never;
    const service=new QualityService(prisma,tenant);
    await expect(service.createFeedback({branchId:'branch-a',customerId:'customer-a',source:'MANUAL',classification:'UNCLASSIFIED',overallRating:6},'user-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes quality case listing by tenant company and active branch',async()=>{
    const query=jest.fn().mockResolvedValue([]);
    const prisma={$queryRawUnsafe:query} as never;
    const service=new QualityService(prisma,tenant);
    await service.listCases({status:'OPEN'});
    expect(String(query.mock.calls[0][0])).toContain('q.tenant_id=$1::text AND q.company_id=$2::text');
    expect(query.mock.calls[0].slice(1,4)).toEqual(['tenant-a','company-a','branch-a']);
  });

  it('does not create a second quality case for the same feedback',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:'branch-a'}])
      .mockResolvedValueOnce([{id:'feedback-a',branchId:'branch-a',customerId:'customer-a',appointmentId:null,serviceId:null,staffId:null,careEventId:null}])
      .mockResolvedValueOnce([{id:'case-a',status:'OPEN'}]);
    const prisma={$queryRawUnsafe:query,$transaction:jest.fn()} as never;
    const service=new QualityService(prisma,tenant);
    await expect(service.createCase({branchId:'branch-a',feedbackId:'feedback-a',sourceType:'FEEDBACK',category:'SERVICE',severity:'HIGH',title:'Service complaint'},'user-a')).resolves.toEqual({id:'case-a',status:'OPEN',duplicate:true});
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('rejects an assignee without active company or branch access',async()=>{
    const tx={
      $queryRawUnsafe:jest.fn()
        .mockResolvedValueOnce([{id:'case-a',status:'OPEN',branchId:'branch-a',assignedUserId:null,resolution:null}])
        .mockResolvedValueOnce([]),
      $executeRawUnsafe:jest.fn(),
    };
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new QualityService(prisma,tenant);
    await expect(service.assign('case-a','user-outside','user-a')).rejects.toThrow('Assigned user is outside tenant/company/branch scope.');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(String(tx.$queryRawUnsafe.mock.calls[1][0])).toContain('membership_branch_access');
    expect(tx.$queryRawUnsafe.mock.calls[1].slice(1)).toEqual(['user-outside','tenant-a','company-a','branch-a']);
  });

  it('blocks skipping directly from OPEN to CLOSED',async()=>{
    const tx={$queryRawUnsafe:jest.fn().mockResolvedValue([{id:'case-a',status:'OPEN',branchId:'branch-a',assignedUserId:null,resolution:null}])};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new QualityService(prisma,tenant);
    await expect(service.transition('case-a','CLOSED','user-a',{})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires root cause corrective action and resolution before RESOLVED',async()=>{
    const tx={$queryRawUnsafe:jest.fn().mockResolvedValue([{id:'case-a',status:'INVESTIGATING',branchId:'branch-a',assignedUserId:null,resolution:null}])};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new QualityService(prisma,tenant);
    await expect(service.transition('case-a','RESOLVED','user-a',{rootCause:'',correctiveAction:'Fixed',resolution:'Resolved'})).rejects.toBeInstanceOf(BadRequestException);
  });
});
