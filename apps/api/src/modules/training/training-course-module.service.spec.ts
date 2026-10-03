import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingCourseModuleService } from './training-course-module.service';

describe('TrainingCourseModuleService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1'};

  async function createService(prisma: object) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrainingCourseModuleService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
      ],
    }).compile();
    return moduleRef.get(TrainingCourseModuleService);
  }

  it('creates the next module sequence under a locked draft version', async()=>{
    const query=jest.fn(async(sql:string,..._params:unknown[])=>{
      if(sql.includes('FROM training_course_versions v'))return[{id:'v1'}];
      if(sql.includes('MAX(sequence)'))return[{sequence:3}];
      if(sql.includes('INSERT INTO training_course_modules'))return[{id:'m3',sequence:3,title:'Advanced',description:null}];
      return[];
    });
    const execute=jest.fn(async(..._args:unknown[])=>1);
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={
      $queryRawUnsafe:query,
      $transaction:jest.fn(async(fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
    };
    const service=await createService(prisma);

    const result=await service.create('v1',{title:'Advanced'},'u1');

    expect(result.sequence).toBe(3);
    expect(execute.mock.calls.some(call=>String(call[1]).includes('training-modules:v1'))).toBe(true);
  });

  it('reorders modules using positive staging sequences', async()=>{
    const rootQuery=jest.fn(async(sql:string,..._params:unknown[])=>sql.includes('FROM training_course_versions v')?[{id:'v1'}]:[]);
    const txQuery=jest.fn(async(sql:string,..._params:unknown[])=>{
      if(sql.includes('FROM training_course_modules'))return[{id:'m1',sequence:1},{id:'m2',sequence:2}];
      return[];
    });
    const execute=jest.fn(async(..._args:unknown[])=>1);
    const tx={$queryRawUnsafe:txQuery,$executeRawUnsafe:execute};
    const prisma={
      $queryRawUnsafe:rootQuery,
      $transaction:jest.fn(async(fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
    };
    const service=await createService(prisma);

    await service.reorder('v1',['m2','m1']);

    const sequenceArgs=execute.mock.calls
      .filter(call=>String(call[0]).includes('UPDATE training_course_modules'))
      .map(call=>Number(call[4]));
    expect(sequenceArgs.every(value=>value>=1)).toBe(true);
    expect(sequenceArgs.slice(-2)).toEqual([1,2]);
  });

  it('rejects assigning a lesson that is not on the target draft', async()=>{
    const query=jest.fn(async(sql:string,..._params:unknown[])=>{
      if(sql.includes('FROM training_course_modules m'))return[{id:'m1',versionId:'v1',sequence:1,title:'Core',description:null}];
      return[];
    });
    const prisma={
      $queryRawUnsafe:query,
      $executeRawUnsafe:jest.fn(async(..._args:unknown[])=>0),
    };
    const service=await createService(prisma);

    await expect(service.assignLesson('m1','l-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
