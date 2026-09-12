import { TrainingPlanningService } from './training-planning.service';

describe('TrainingPlanningService',()=>{
  it('enrolls staff into a scheduled capacity controlled session',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_sessions WHERE'))return[{id:'sess1',branchId:'b1',capacity:5,status:'SCHEDULED'}];
      if(sql.includes('SELECT id FROM staff'))return[{id:'s1'}];
      if(sql.includes('COUNT(*)::int AS count'))return[{count:2}];
      if(sql.includes('INSERT INTO training_session_enrollments'))return[{id:'e1',status:'ENROLLED',staffId:'s1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    const result=await service.enroll('sess1',{staffId:'s1'},'u1');
    expect(result.status).toBe('ENROLLED');
    expect(query.mock.calls.some(call=>String(call[0]).includes('training_session_enrollments'))).toBe(true);
  });
});
