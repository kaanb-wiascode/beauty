import { BadRequestException } from '@nestjs/common';
import { TrainingLearnerAssessmentService } from './training-learner-assessment.service';

describe('TrainingLearnerAssessmentService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('returns learner exam questions without selecting answer keys',async()=>{
    const queries:string[]=[];
    const prisma={$queryRawUnsafe:jest.fn(async(sql:string)=>{
      queries.push(sql);
      if(sql.includes('FROM training_assignments a'))return[{id:'a1',status:'IN_PROGRESS',courseVersionId:'v1',staffId:'s1'}];
      if(sql.includes('FROM training_exams WHERE'))return[{id:'e1',title:'Quiz',passScore:70,maxAttempts:3}];
      if(sql.includes('FROM training_exam_questions'))return[{id:'q1',sequence:1,questionType:'TRUE_FALSE',prompt:'Test',options:null,points:1}];
      if(sql.includes('FROM training_exam_attempts'))return[];
      return[];
    })};
    const progress={summary:jest.fn(async()=>({requiredComplete:true}))};
    const service=new TrainingLearnerAssessmentService(prisma as any,tenant as any,progress as any,{} as any);
    const result=await service.exam('u1','a1','e1');
    expect(result.questions).toHaveLength(1);
    expect(queries.find(sql=>sql.includes('FROM training_exam_questions'))).not.toContain('correct_answer');
  });

  it('blocks assessment until required lessons are complete',async()=>{
    const prisma={$queryRawUnsafe:jest.fn(async(sql:string)=>sql.includes('FROM training_assignments a')?[{id:'a1',status:'IN_PROGRESS',courseVersionId:'v1',staffId:'s1'}]:[])};
    const progress={summary:jest.fn(async()=>({requiredComplete:false}))};
    const lms={submitExamAttempt:jest.fn()};
    const service=new TrainingLearnerAssessmentService(prisma as any,tenant as any,progress as any,lms as any);
    await expect(service.submit('u1','a1','e1',{q1:true})).rejects.toBeInstanceOf(BadRequestException);
    expect(lms.submitExamAttempt).not.toHaveBeenCalled();
  });

  it('delegates grading to the existing LMS engine after ownership and lesson checks',async()=>{
    const prisma={$queryRawUnsafe:jest.fn(async(sql:string)=>sql.includes('FROM training_assignments a')?[{id:'a1',status:'IN_PROGRESS',courseVersionId:'v1',staffId:'s1'}]:[])};
    const progress={summary:jest.fn(async()=>({requiredComplete:true}))};
    const lms={submitExamAttempt:jest.fn(async()=>({score:100,passed:true}))};
    const service=new TrainingLearnerAssessmentService(prisma as any,tenant as any,progress as any,lms as any);
    const result=await service.submit('u1','a1','e1',{q1:true});
    expect(lms.submitExamAttempt).toHaveBeenCalledWith('a1','e1',{answers:{q1:true}},'u1');
    expect(result).toEqual({score:100,passed:true});
  });
});
