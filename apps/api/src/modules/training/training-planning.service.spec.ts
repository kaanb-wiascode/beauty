import { BadRequestException } from '@nestjs/common';
import { TrainingPlanningService } from './training-planning.service';

describe('TrainingPlanningService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};

  it('enrolls staff into a scheduled capacity controlled session',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_sessions WHERE'))return[{id:'sess1',branchId:'b1',courseId:'c1',courseVersionId:'v1',capacity:5,status:'SCHEDULED'}];
      if(sql.includes('SELECT id FROM staff'))return[{id:'s1'}];
      if(sql.includes('COUNT(*)::int AS count'))return[{count:2}];
      if(sql.includes('INSERT INTO training_session_enrollments'))return[{id:'e1',status:'ENROLLED',staffId:'s1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    const result=await service.enroll('sess1',{staffId:'s1'},'u1');
    expect(result.status).toBe('ENROLLED');
    expect(query.mock.calls.some(call=>String(call[0]).includes('training_session_enrollments'))).toBe(true);
    expect(tx.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('rejects an assignment outside the enrollment staff/course/version scope',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_sessions WHERE'))return[{id:'sess1',branchId:'b1',courseId:'c1',courseVersionId:'v1',capacity:5,status:'SCHEDULED'}];
      if(sql.includes('SELECT id FROM staff'))return[{id:'s1'}];
      if(sql.includes('FROM training_assignments'))return[];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    await expect(service.enroll('sess1',{staffId:'s1',assignmentId:'a-other'},'u1')).rejects.toThrow('Training assignment does not match the session enrollment scope.');
    expect(query.mock.calls.some(call=>String(call[0]).includes('INSERT INTO training_session_enrollments'))).toBe(false);
  });

  it('rejects calendar reads outside the active branch scope',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    await expect(service.calendar({branchId:'b2'})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects invalid session lifecycle transitions',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>sql.includes('FROM training_sessions WHERE')?[{id:'sess1',branchId:'b1',status:'COMPLETED'}]:[]);
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    await expect(service.transitionSession('sess1','IN_PROGRESS',{},'u1')).rejects.toThrow('Session cannot transition from COMPLETED to IN_PROGRESS.');
  });

  it('does not allow attendance before a session starts',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_sessions WHERE'))return[{id:'sess1',branchId:'b1',status:'SCHEDULED'}];
      if(sql.includes('FROM training_session_enrollments'))return[{id:'e1',status:'ENROLLED',staffId:'s1'}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    await expect(service.transitionEnrollment('sess1','e1','ATTENDED','u1')).rejects.toThrow('Attendance can only be recorded after the session starts.');
  });

  it('blocks development plan completion while actionable items remain open',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM staff_development_plans'))return[{id:'p1',branchId:'b1',status:'ACTIVE'}];
      if(sql.includes('FROM staff_development_plan_items'))return[{count:1}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new TrainingPlanningService(prisma as any,tenant as any);
    await expect(service.transitionPlan('p1','COMPLETED','u1')).rejects.toThrow('All development plan items must be completed or cancelled before plan completion.');
  });
});
