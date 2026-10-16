import { BadRequestException } from '@nestjs/common';
import { QualityInspectionService } from './quality-inspection.service';

describe('QualityInspectionService',()=>{
  const tenant={getTenantId:jest.fn(()=>'tenant-1'),getCompanyId:jest.fn(()=>'company-1'),getBranchId:jest.fn(()=>'branch-1')};

  it('lists inspections only inside tenant/company/branch scope',async()=>{
    const prisma={$queryRawUnsafe:jest.fn().mockResolvedValue([])};
    const service=new QualityInspectionService(prisma as any,tenant as any);
    await service.listInspections({status:'PLANNED',limit:10});
    const [sql,tenantId,companyId,branchId,status,limit]=prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('q.tenant_id=$1::text');
    expect(sql).toContain('q.company_id=$2::text');
    expect(sql).toContain('q.branch_id=$3::text');
    expect([tenantId,companyId,branchId,status,limit]).toEqual(['tenant-1','company-1','branch-1','PLANNED',10]);
  });

  it('returns an existing plan for the same idempotency key',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()
      .mockResolvedValueOnce([{id:'branch-1'}])
      .mockResolvedValueOnce([{id:'template-1'}])
      .mockResolvedValueOnce([{id:'inspection-1',status:'PLANNED'}])};
    const service=new QualityInspectionService(prisma as any,tenant as any);
    await expect(service.planInspection({branchId:'branch-1',templateId:'template-1',plannedFor:'2026-09-13T09:00:00Z',idempotencyKey:'daily-1'},'user-1')).resolves.toMatchObject({id:'inspection-1',duplicate:true});
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });

  it('rejects planning outside the active branch scope',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()};
    const service=new QualityInspectionService(prisma as any,tenant as any);
    await expect(service.planInspection({branchId:'branch-2',templateId:'template-1',plannedFor:'2026-09-13T09:00:00Z'},'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('uses row locking when starting an inspection',async()=>{
    const tx={$queryRawUnsafe:jest.fn()
      .mockResolvedValueOnce([{id:'inspection-1',status:'PLANNED',branchId:'branch-1'}])
      .mockResolvedValueOnce([{id:'inspection-1',status:'IN_PROGRESS'}])};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new QualityInspectionService(prisma as any,tenant as any);
    await service.startInspection('inspection-1','user-1');
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});
