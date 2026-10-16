import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrainingLearningPathService } from './training-learning-path.service';

describe('TrainingLearningPathService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('rejects a prerequisite that would create a dependency cycle',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_program_items') && sql.includes('(id=$4::text OR id=$5::text)'))return[{id:'item-a',sequence:1},{id:'item-b',sequence:2}];
      if(sql.includes("FROM training_program_versions") && sql.includes("status='DRAFT'"))return[{id:'v1'}];
      if(sql.includes('WITH RECURSIVE deps'))return[{exists:1}];
      return[];
    });
    const service=new TrainingLearningPathService({$queryRawUnsafe:query} as any,tenant as any);
    await expect(service.addPrerequisite('v1','item-a','item-b','u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a path item locked until every prerequisite assignment is completed',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_program_assignments pa'))return[{id:'pa1',status:'IN_PROGRESS',staffId:'s1',programId:'p1',programVersionId:'v1',code:'ACA',title:'Academy',staffFirstName:'Ada',staffLastName:'Test'}];
      if(sql.includes('FROM training_program_items i'))return[
        {id:'item-1',sequence:1,courseId:'c1',isRequired:true,courseCode:'C1',courseTitle:'First',assignmentId:'a1',assignmentStatus:'IN_PROGRESS',prerequisiteItemIds:[]},
        {id:'item-2',sequence:2,courseId:'c2',isRequired:true,courseCode:'C2',courseTitle:'Second',assignmentId:'a2',assignmentStatus:'ASSIGNED',prerequisiteItemIds:['item-1']},
      ];
      return[];
    });
    const service=new TrainingLearningPathService({$queryRawUnsafe:query} as any,tenant as any);
    const result=await service.assignmentProgress('pa1');
    expect(result.progressPercent).toBe(0);
    expect(result.items[1]).toEqual(expect.objectContaining({isUnlocked:false,blockedByItemIds:['item-1']}));
  });

  it('unlocks a dependent item after its prerequisite assignment completes',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_program_assignments pa'))return[{id:'pa1',status:'IN_PROGRESS',staffId:'s1',programId:'p1',programVersionId:'v1',code:'ACA',title:'Academy',staffFirstName:'Ada',staffLastName:'Test'}];
      if(sql.includes('FROM training_program_items i'))return[
        {id:'item-1',sequence:1,courseId:'c1',isRequired:true,courseCode:'C1',courseTitle:'First',assignmentId:'a1',assignmentStatus:'COMPLETED',prerequisiteItemIds:[]},
        {id:'item-2',sequence:2,courseId:'c2',isRequired:true,courseCode:'C2',courseTitle:'Second',assignmentId:'a2',assignmentStatus:'ASSIGNED',prerequisiteItemIds:['item-1']},
      ];
      return[];
    });
    const service=new TrainingLearningPathService({$queryRawUnsafe:query} as any,tenant as any);
    const result=await service.assignmentProgress('pa1');
    expect(result.progressPercent).toBe(50);
    expect(result.items[1]).toEqual(expect.objectContaining({isUnlocked:true,blockedByItemIds:[]}));
  });

  it('rejects program assignments outside active branch scope',async()=>{
    const service=new TrainingLearningPathService({$queryRawUnsafe:jest.fn(async()=>[])} as any,tenant as any);
    await expect(service.assignmentProgress('outside')).rejects.toBeInstanceOf(NotFoundException);
  });
});
