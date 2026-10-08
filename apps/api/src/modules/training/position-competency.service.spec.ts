import { PositionCompetencyService } from './position-competency.service';

describe('PositionCompetencyService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};

  it('creates a versioned position mapping under an advisory lock',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM competency_profiles'))return[{id:'p1'}];
      if(sql.includes('INSERT INTO position_competency_profile_mappings'))return[{id:'m1',positionKey:'BRANCH MANAGER',profileId:'p1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new PositionCompetencyService(prisma as any,tenant as any);
    const result=await service.createMapping({position:' Branch   Manager ',profileId:'p1',effectiveFrom:'2026-09-12'},'u1');
    expect(result.positionKey).toBe('BRANCH MANAGER');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'),expect.stringContaining('position-competency:'));
  });

  it('does not overwrite an existing active staff competency profile',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM employee_profiles'))return[{staffId:'s1',branchId:'b1',position:'Branch Manager',mappingId:'m1',profileId:'p1'}];
      if(sql.includes('FROM staff_competency_profiles'))return[{id:'sp1',profileId:'p-existing'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new PositionCompetencyService(prisma as any,tenant as any);
    const result=await service.process('u1',10);
    expect(result).toEqual({matched:1,assigned:0,skipped:1});
    expect(tx.$executeRawUnsafe.mock.calls.some(call=>String(call[0]).includes('INSERT INTO staff_competency_profiles'))).toBe(false);
  });
});
