import { TrainingLessonProgressService } from './training-lesson-progress.service';

describe('TrainingLessonProgressService',()=>{
  it('completes a lesson idempotently under assignment scope',async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('JOIN training_lessons l ON l.course_version_id=a.course_version_id'))return[{assignmentId:'a1',status:'ASSIGNED',branchId:'b1',staffId:'s1',courseVersionId:'v1',lessonId:'l1',isRequired:true}];
      if(sql.includes('INSERT INTO training_lesson_progress'))return[{id:'p1',status:'COMPLETED',startedAt:new Date(),completedAt:new Date()}];
      return[];
    });
    const tx={$executeRawUnsafe:execute,$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingLessonProgressService(prisma as any,tenant as any);

    const result=await service.complete('a1','l1','u1');

    expect(result.status).toBe('COMPLETED');
    expect(query.mock.calls.some(call=>String(call[0]).includes('ON CONFLICT(tenant_id,company_id,assignment_id,lesson_id)'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes("training_lesson_progress_events"))).toBe(true);
  });
});
