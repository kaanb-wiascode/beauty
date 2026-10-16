import { BadRequestException } from '@nestjs/common';
import { CompetencyReviewService } from './competency-review.service';

describe('CompetencyReviewService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};

  it('rejects schedule creation outside the active branch',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()};
    const service=new CompetencyReviewService(prisma as any,tenant as any);
    await expect(service.createSchedule({name:'Quarterly',cadenceDays:90,branchId:'b2'},'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires fresh assessments for every profile competency before completion',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM competency_reviews'))return[{id:'r1',branchId:'b1',staffId:'s1',profileId:'p1',status:'OPEN',openedAt:new Date()}];
      if(sql.includes('FROM competency_profile_requirements'))return[{count:1}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new CompetencyReviewService(prisma as any,tenant as any);
    await expect(service.complete('r1','u1')).rejects.toThrow('All profile competencies require a fresh assessment before review completion.');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('opens due reviews using skip-locked schedule claims',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM competency_review_schedules'))return[{id:'sch1',branchId:'b1',profileId:null,cadenceDays:90,dueOffsetDays:14,nextRunAt:new Date()}];
      if(sql.includes('INSERT INTO competency_reviews'))return[{id:'r1',branchId:'b1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new CompetencyReviewService(prisma as any,tenant as any);
    const result=await service.processDue('u1',10);
    expect(result).toEqual({claimedSchedules:1,openedReviews:1});
    expect(query.mock.calls.some(call=>String(call[0]).includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
  });
});
