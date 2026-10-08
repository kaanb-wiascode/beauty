import { TrainingProgramService } from './training-program.service';

describe('TrainingProgramService',()=>{
  it('creates pinned course assignments for a published learning program',async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('SELECT id FROM staff'))return[{id:'s1'}];
      if(sql.includes('FROM training_program_versions')&&sql.includes("status='PUBLISHED'"))return[{id:'pv1'}];
      if(sql.includes('FROM training_program_items i'))return[{id:'i1',sequence:1,courseId:'c1',isRequired:true,dueOffsetDays:7,courseVersionId:'cv1'}];
      if(sql.includes('INSERT INTO training_program_assignments'))return[{id:'pa1',status:'ASSIGNED'}];
      if(sql.includes('INSERT INTO training_assignments'))return[{id:'a1'}];
      return[];
    });
    const tx={$executeRawUnsafe:execute,$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingProgramService(prisma as any,tenant as any);

    const result=await service.assign('p1',{branchId:'b1',staffId:'s1'},'u1');

    expect(result.programAssignmentId).toBe('pa1');
    expect(result.courseAssignmentsCreated).toBe(1);
    expect(query.mock.calls.some(call=>String(call[0]).includes("'LEARNING_PROGRAM'"))).toBe(true);
    expect(query.mock.calls.some(call=>String(call[0]).includes('course_version_id'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
  });
});
