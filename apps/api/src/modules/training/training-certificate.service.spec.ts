import { TrainingCertificateService } from './training-certificate.service';

describe('TrainingCertificateService',()=>{
  it('creates an idempotent renewal assignment against the published course version',async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_certificates cert')&&sql.includes('JOIN training_course_versions'))return[{id:'cert1',status:'EXPIRED',branchId:'b1',staffId:'s1',assignmentId:'a1',courseVersionId:'v1',expiresAt:new Date(),renewalAssignmentId:null,courseId:'course1'}];
      if(sql.includes("status='PUBLISHED'"))return[{id:'v2'}];
      if(sql.includes('INSERT INTO training_assignments'))return[{id:'a2'}];
      return[];
    });
    const tx={$executeRawUnsafe:execute,$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingCertificateService(prisma as any,tenant as any);

    const result=await service.assignRenewal('cert1',{},'u1');

    expect(result.assignmentId).toBe('a2');
    expect(result.status).toBe('RENEWAL_ASSIGNED');
    expect(query.mock.calls.some(call=>String(call[0]).includes('ON CONFLICT(tenant_id,company_id,source_key)'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes('pg_advisory_xact_lock'))).toBe(true);
    expect(execute.mock.calls.some(call=>String(call[0]).includes("'RENEWAL_ASSIGNED'"))).toBe(true);
  });

  it('derives lifecycle states without persisting an EXPIRING status',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const rows=[
      {id:'valid',status:'ACTIVE',expiresAt:'2027-01-01T00:00:00Z',renewalAssignmentId:null},
      {id:'expiring',status:'ACTIVE',expiresAt:'2026-09-30T00:00:00Z',renewalAssignmentId:null},
      {id:'expired-live',status:'ACTIVE',expiresAt:'2026-09-14T00:00:00Z',renewalAssignmentId:null},
      {id:'expired',status:'EXPIRED',expiresAt:'2026-09-10T00:00:00Z',renewalAssignmentId:null},
      {id:'revoked',status:'REVOKED',expiresAt:'2026-09-20T00:00:00Z',renewalAssignmentId:null},
      {id:'renewing',status:'RENEWAL_ASSIGNED',expiresAt:'2026-09-20T00:00:00Z',renewalAssignmentId:'a2'},
    ];
    const prisma={$queryRawUnsafe:jest.fn(async()=>rows)};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingCertificateService(prisma as any,tenant as any);

    const result=await service.lifecycle({warningDays:30});

    expect(result.summary).toEqual({VALID:1,EXPIRING:2,EXPIRED:2,REVOKED:1,renewalInProgress:1});
    expect(result.certificates.find((item:any)=>item.id==='expiring')?.lifecycleStatus).toBe('EXPIRING');
    expect(result.certificates.find((item:any)=>item.id==='expired-live')?.lifecycleStatus).toBe('EXPIRED');
    expect(result.certificates.find((item:any)=>item.id==='revoked')?.lifecycleStatus).toBe('REVOKED');
    expect(result.certificates.find((item:any)=>item.id==='renewing')?.renewalState).toBe('IN_PROGRESS');
    expect(String((prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0])).not.toContain("status='EXPIRING'");
    jest.useRealTimers();
  });

  it('uses the existing renewal engine for recertification candidates and keeps branch scope in discovery',async()=>{
    const query=jest.fn(async()=>[{id:'cert1'},{id:'cert2'}]);
    const prisma={$queryRawUnsafe:query};
    const tenant={getTenantId:()=> 't1',getCompanyId:()=> 'co1',getBranchId:()=> 'b1'};
    const service=new TrainingCertificateService(prisma as any,tenant as any);
    const renew=jest.spyOn(service,'assignRenewal')
      .mockResolvedValueOnce({certificateId:'cert1',assignmentId:'a1',status:'RENEWAL_ASSIGNED',duplicate:false} as any)
      .mockResolvedValueOnce({certificateId:'cert2',assignmentId:'a2',status:'RENEWAL_ASSIGNED',duplicate:false} as any);

    const result=await service.processRecertification('u1',{warningDays:30,limit:50});

    expect(result).toMatchObject({claimed:2,assigned:2,duplicates:0,failed:0});
    expect(renew).toHaveBeenNthCalledWith(1,'cert1',{},'u1');
    expect(renew).toHaveBeenNthCalledWith(2,'cert2',{},'u1');
    expect(String(query.mock.calls[0][0])).toContain("cert.status IN ('ACTIVE','EXPIRED')");
    expect(query.mock.calls[0].slice(-3)).toEqual(['b1',30,50]);
  });
});
