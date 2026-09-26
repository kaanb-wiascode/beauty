import { TrainingOperationsBridgeService } from './training-operations-bridge.service';

describe('TrainingOperationsBridgeService', () => {
  const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'c1',getBranchId:()=> 'b1'};

  it('scales a Training score into the mapped HR competency level',async()=>{
    const queries:string[]=[];
    const tx={
      $queryRawUnsafe:jest.fn(async(sql:string,...args:unknown[])=>{
        queries.push(sql);
        if(sql.includes('FROM staff_competency_assessments a'))return[{sourceId:'ta1',branchId:'b1',staffId:'s1',score:80,assessedAt:new Date('2026-09-15'),hrCompetencyId:'hc1',maxLevel:5}];
        if(sql.includes('INSERT INTO hr_employee_competency_assessments')){expect(args[5]).toBe(4);return[{id:'ha1'}];}
        return[];
      }),
      $executeRawUnsafe:jest.fn(async()=>1),
    };
    const prisma={$transaction:jest.fn(async(fn:(client:any)=>Promise<any>)=>fn(tx))};
    const service=new TrainingOperationsBridgeService(prisma as any,tenant as any);
    const result=await service.process('u1',10);
    expect(result.competencySynced).toBe(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalled();
    expect(queries.some((sql)=>sql.includes('hr_employee_competency_assessments'))).toBe(true);
  });

  it('bridges a mapped Training certificate into a verified HR certificate',async()=>{
    const tx={
      $queryRawUnsafe:jest.fn(async(sql:string)=>{
        if(sql.includes('FROM staff_competency_assessments a'))return[];
        if(sql.includes('FROM training_certificates cert'))return[{sourceId:'tc1',branchId:'b1',staffId:'s1',certificateNo:'CERT-1',issuedAt:new Date('2026-01-01'),expiresAt:new Date('2027-01-01'),courseId:'course1',courseTitle:'Alexandrite',hrCertificationTypeId:'type1',requiresExpiry:true}];
        if(sql.includes('SELECT id FROM hr_employee_certifications'))return[];
        if(sql.includes('INSERT INTO hr_employee_certifications'))return[{id:'hrcert1'}];
        return[];
      }),
      $executeRawUnsafe:jest.fn(async()=>1),
    };
    const prisma={$transaction:jest.fn(async(fn:(client:any)=>Promise<any>)=>fn(tx))};
    const service=new TrainingOperationsBridgeService(prisma as any,tenant as any);
    const result=await service.process('u1',10);
    expect(result.certificationSynced).toBe(1);
    const insert=(tx.$queryRawUnsafe as jest.Mock).mock.calls.find(([sql])=>String(sql).includes('INSERT INTO hr_employee_certifications'));
    expect(insert?.[0]).toContain("'VERIFIED'");
  });

  it('skips a non-expiring Training certificate when the HR certification type requires expiry',async()=>{
    const tx={
      $queryRawUnsafe:jest.fn(async(sql:string)=>{
        if(sql.includes('FROM staff_competency_assessments a'))return[];
        if(sql.includes('FROM training_certificates cert'))return[{sourceId:'tc1',branchId:'b1',staffId:'s1',certificateNo:'CERT-1',issuedAt:new Date('2026-01-01'),expiresAt:null,courseId:'course1',courseTitle:'Alexandrite',hrCertificationTypeId:'type1',requiresExpiry:true}];
        return[];
      }),
      $executeRawUnsafe:jest.fn(async()=>1),
    };
    const prisma={$transaction:jest.fn(async(fn:(client:any)=>Promise<any>)=>fn(tx))};
    const service=new TrainingOperationsBridgeService(prisma as any,tenant as any);
    const result=await service.process('u1',10);
    expect(result.skippedMissingExpiry).toBe(1);
    expect((tx.$queryRawUnsafe as jest.Mock).mock.calls.some(([sql])=>String(sql).includes('INSERT INTO hr_employee_certifications'))).toBe(false);
  });

  it('revokes an HR certificate when its source Training certificate is revoked',async()=>{
    const tx={
      $queryRawUnsafe:jest.fn(async(sql:string)=>{
        if(sql.includes('FROM staff_competency_assessments a'))return[];
        if(sql.includes('FROM training_certificates cert'))return[];
        if(sql.includes('FROM training_operations_bridge_events e JOIN training_certificates'))return[{bridgeEventId:'e1',sourceId:'tc1',targetId:'hc1'}];
        return[];
      }),
      $executeRawUnsafe:jest.fn(async()=>1),
    };
    const prisma={$transaction:jest.fn(async(fn:(client:any)=>Promise<any>)=>fn(tx))};
    const service=new TrainingOperationsBridgeService(prisma as any,tenant as any);
    const result=await service.process('u1',10);
    expect(result.revokedSynced).toBe(1);
    expect((tx.$executeRawUnsafe as jest.Mock).mock.calls.some(([sql])=>String(sql).includes("status='REVOKED'"))).toBe(true);
  });

  it('does not create eligibility records when no explicit mapping produces candidates',async()=>{
    const tx={$queryRawUnsafe:jest.fn(async()=>[]),$executeRawUnsafe:jest.fn(async()=>1)};
    const prisma={$transaction:jest.fn(async(fn:(client:any)=>Promise<any>)=>fn(tx))};
    const service=new TrainingOperationsBridgeService(prisma as any,tenant as any);
    await expect(service.process('u1',20)).resolves.toEqual({claimed:0,competencySynced:0,certificationSynced:0,revokedSynced:0,skippedMissingExpiry:0});
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
