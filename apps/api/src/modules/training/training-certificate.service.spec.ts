import { TrainingCertificateService } from './training-certificate.service';

describe('TrainingCertificateService',()=>{
  it('creates an idempotent renewal assignment against the published course version',async()=>{
    const execute=jest.fn<Promise<number>,any[]>(async()=>1);
    const query=jest.fn<Promise<any[]>,any[]>(async(sql:string)=>{
      if(sql.includes('FROM training_certificates cert JOIN training_course_versions'))return[{id:'cert1',status:'EXPIRED',branchId:'b1',staffId:'s1',assignmentId:'a1',courseVersionId:'v1',expiresAt:new Date(),renewalAssignmentId:null,courseId:'course1'}];
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
});
