import { NotFoundException } from '@nestjs/common';
import { TrainingCourseModuleService } from './training-course-module.service';

describe('TrainingCourseModuleService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1'};

  it('creates the next module sequence under a locked draft version', async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_course_versions v'))return[{id:'v1'}];
      if(sql.includes('MAX(sequence)'))return[{sequence:3}];
      if(sql.includes('INSERT INTO training_course_modules'))return[{id:'m3',sequence:3,title:'Advanced',description:null}];
      return[];
    });
    const execute=jest.fn(async()=>1);
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={
      $queryRawUnsafe:query,
      $transaction:jest.fn(async(fn:any)=>fn(tx)),
    };
    const service=new TrainingCourseModuleService(prisma as any,tenant as any);

    const result=await service.create('v1',{title:'Advanced'},'u1');

    expect(result.sequence).toBe(3);
    expect(execute.mock.calls.some(call=>String(call[1]).includes('training-modules:v1'))).toBe(true);
  });

  it('reorders modules using positive staging sequences', async()=>{
    const rootQuery=jest.fn(async(sql:string)=>sql.includes('FROM training_course_versions v')?[{id:'v1'}]:[]);
    const txQuery=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_course_modules'))return[{id:'m1',sequence:1},{id:'m2',sequence:2}];
      return[];
    });
    const execute=jest.fn(async()=>1);
    const tx={$queryRawUnsafe:txQuery,$executeRawUnsafe:execute};
    const prisma={
      $queryRawUnsafe:rootQuery,
      $transaction:jest.fn(async(fn:any)=>fn(tx)),
    };
    const service=new TrainingCourseModuleService(prisma as any,tenant as any);

    await service.reorder('v1',['m2','m1']);

    const sequenceArgs=execute.mock.calls
      .filter(call=>String(call[0]).includes('UPDATE training_course_modules'))
      .map(call=>Number(call[4]));
    expect(sequenceArgs.every(value=>value>=1)).toBe(true);
    expect(sequenceArgs.slice(-2)).toEqual([1,2]);
  });

  it('rejects assigning a lesson that is not on the target draft', async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_course_modules m'))return[{id:'m1',versionId:'v1',sequence:1,title:'Core',description:null}];
      return[];
    });
    const prisma={
      $queryRawUnsafe:query,
      $executeRawUnsafe:jest.fn(async()=>0),
    };
    const service=new TrainingCourseModuleService(prisma as any,tenant as any);

    await expect(service.assignLesson('m1','l-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
