import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingBulkAssignmentService } from './training-bulk-assignment.service';

describe('TrainingBulkAssignmentService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> null};

  async function createService(prisma: object) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrainingBulkAssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenant },
      ],
    }).compile();
    return moduleRef.get(TrainingBulkAssignmentService);
  }

  it('pins every bulk assignment to the current published version and skips duplicates', async()=>{
    const rootQuery=jest.fn(async(sql:string,..._params:unknown[])=>{
      if(sql.includes('FROM training_course_versions v'))return[{id:'v2',version:2}];
      if(sql.includes('FROM staff s JOIN branches b'))return[
        {id:'s1',branchId:'b1'},
        {id:'s2',branchId:'b1'},
      ];
      return[];
    });
    let insertCount=0;
    const txQuery=jest.fn(async(sql:string,..._params:unknown[])=>{
      if(sql.includes('INSERT INTO training_assignments')){
        insertCount+=1;
        return insertCount===1?[{id:'a1'}]:[];
      }
      return[];
    });
    const execute=jest.fn(async(..._args:unknown[])=>1);
    const tx={$queryRawUnsafe:txQuery,$executeRawUnsafe:execute};
    const prisma={
      $queryRawUnsafe:rootQuery,
      $transaction:jest.fn(async(fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
    };
    const service=await createService(prisma);

    const result=await service.createBulk({
      courseId:'course1',targetType:'PERSONNEL',targetIds:['s1','s2'],idempotencyKey:'batch-12345678',note:'Mandatory',
    },'u1');

    expect(result.courseVersionId).toBe('v2');
    expect(result.created).toBe(1);
    expect(result.duplicates).toBe(1);
    const assignmentCall=txQuery.mock.calls.find(call=>String(call[0]).includes('INSERT INTO training_assignments'));
    expect(assignmentCall?.[5]).toBe('v2');
    expect(execute.mock.calls.filter(call=>String(call[0]).includes('training_assignment_events')).length).toBe(2);
  });

  it('rejects assignment when a course has no published version',async()=>{
    const prisma={$queryRawUnsafe:jest.fn(async(..._args:unknown[])=>[])};
    const service=await createService(prisma);
    await expect(service.createBulk({
      courseId:'course1',targetType:'PERSONNEL',targetIds:['s1'],idempotencyKey:'batch-12345678',
    },'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
