import { BadRequestException } from '@nestjs/common';
import { TrainingRoleAcademyService } from './training-role-academy.service';

describe('TrainingRoleAcademyService',()=>{
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('requires a published learning path before saving a role academy',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM hr_positions p CROSS JOIN training_programs'))return[{positionId:'pos1',programId:'prog1'}];
      if(sql.includes('FROM training_program_versions'))return[];
      return[];
    });
    const service=new TrainingRoleAcademyService({$queryRawUnsafe:query} as any,tenant as any,{} as any);
    await expect(service.save({positionId:'pos1',programId:'prog1'},'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses a stable role academy idempotency key for automatic assignments',async()=>{
    const query=jest.fn(async(sql:string)=>{
      if(sql.includes('FROM training_role_academies ra') && sql.includes('hr_employee_assignments'))return[
        {ruleId:'rule1',programId:'prog1',staffId:'staff1',branchId:'b1'},
        {ruleId:'rule1',programId:'prog1',staffId:'staff2',branchId:'b1'},
      ];
      return[];
    });
    const programs={assign:jest.fn(async()=>({courseAssignmentsCreated:2}))};
    const service=new TrainingRoleAcademyService({$queryRawUnsafe:query} as any,tenant as any,programs as any);
    const result=await service.process('u1');
    expect(programs.assign).toHaveBeenNthCalledWith(1,'prog1',{branchId:'b1',staffId:'staff1',idempotencyKey:'role-academy:rule1'},'u1');
    expect(programs.assign).toHaveBeenNthCalledWith(2,'prog1',{branchId:'b1',staffId:'staff2',idempotencyKey:'role-academy:rule1'},'u1');
    expect(result).toEqual(expect.objectContaining({matched:2,assigned:2,existing:0,failed:0}));
  });

  it('counts already-created academy assignments as existing instead of duplicating them',async()=>{
    const query=jest.fn(async(sql:string)=>sql.includes('FROM training_role_academies ra')?[{ruleId:'rule1',programId:'prog1',staffId:'staff1',branchId:'b1'}]:[]);
    const programs={assign:jest.fn(async()=>({courseAssignmentsCreated:0}))};
    const service=new TrainingRoleAcademyService({$queryRawUnsafe:query} as any,tenant as any,programs as any);
    const result=await service.process('u1');
    expect(result).toEqual(expect.objectContaining({matched:1,assigned:0,existing:1,failed:0}));
  });
});
