import { BadRequestException } from '@nestjs/common';
import { LmsService } from './lms.service';

describe('LmsService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('grades an exam deterministically and never needs to expose answer keys', async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_assignments a'))return[{id:'a1',status:'ASSIGNED',branchId:'b1',staffId:'s1',courseId:'c1',courseVersionId:'v1'}];
      if(sql.includes('FROM training_exams WHERE'))return[{id:'e1',passScore:70,maxAttempts:3}];
      if(sql.includes('COUNT(*)::int AS count'))return[{count:0}];
      if(sql.includes('correct_answer AS "correctAnswer"'))return[
        {id:'q1',correctAnswer:'A',points:1},
        {id:'q2',correctAnswer:['B','C'],points:1},
      ];
      if(sql.includes('INSERT INTO training_exam_attempts'))return[{id:'at1',attemptNo:1,score:100,passed:true,submittedAt:new Date()}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new LmsService(prisma as any,tenant as any);

    const result=await service.submitExamAttempt('a1','e1',{answers:{q1:'A',q2:['C','B']}},'u1');
    expect(result.score).toBe(100);
    expect(execute.mock.calls.some(call=>String(call[1]).includes('training-exam-attempt:a1:e1'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes("'EXAM_SUBMITTED'"))).toBe(true);
  });

  it('returns published exam questions without selecting correct_answer', async()=>{
    const queries:string[]=[];
    const prisma={$queryRawUnsafe:jest.fn(async(sql:string)=>{
      queries.push(sql);
      if(sql.includes('FROM training_course_versions'))return[{id:'v1',courseId:'c1',version:1,status:'PUBLISHED'}];
      return[];
    })};
    const service=new LmsService(prisma as any,tenant as any);
    await service.publishedCourse('c1');
    const publicExamQuery=queries.find(q=>q.includes('FROM training_exams e LEFT JOIN training_exam_questions'))??'';
    expect(publicExamQuery).not.toContain('correct_answer');
  });

  it('rejects practical assessment for a legacy unversioned assignment',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_assignments a'))return[{id:'a1',status:'ASSIGNED',branchId:'b1',staffId:'s1',courseId:'c1',courseVersionId:null}];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new LmsService(prisma as any,tenant as any);
    await expect(service.assessPractical('a1',{score:90},'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires questions before publishing a theory version',async()=>{
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes("status='DRAFT' FOR UPDATE"))return[{id:'v1',courseId:'c1',requiresTheory:true,requiresPractical:false}];
      if(sql.includes('FROM training_exams e LEFT JOIN'))return[];
      return[];
    });
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:jest.fn()};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new LmsService(prisma as any,tenant as any);
    await expect(service.publishVersion('v1','u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
