import { QualityInspectionSchedulerService } from './quality-inspection-scheduler.service';

describe('QualityInspectionSchedulerService',()=>{
  it('uses row locking and deterministic idempotency for due schedules',async()=>{
    const client={$queryRawUnsafe:jest.fn(async()=>[{scheduleId:'s1',inspectionId:'i1'}])};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(client))};
    const tenant={getContext:()=>({tenantId:'t1',companyId:'c1',branchId:'b1'})};
    const service=new QualityInspectionSchedulerService(prisma as any,tenant as any);
    await expect(service.processDue('u1',{limit:10,workerId:'worker-a'})).resolves.toMatchObject({processed:1});
    const sql=client.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('inspection-schedule:');
    expect(sql).toContain('ON CONFLICT (tenant_id,company_id,idempotency_key) DO NOTHING');
  });
});
