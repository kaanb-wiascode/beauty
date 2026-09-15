import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { ApprovalRuntimeService } from './approval-runtime.service';

describe('ApprovalRuntimeService',()=>{
  it('rejects requester acting on own approval request',async()=>{
    const queryRaw=jest.fn().mockResolvedValueOnce([{id:'req-1',tenantId:'tenant-1',companyId:'company-1',branchId:null,workflowKey:'expense',workflowVersion:1,domain:'finance',entityType:'expense',entityId:'exp-1',requestedByUserId:'user-1',status:'PENDING',currentStepOrder:1}]);
    const prisma={membership:{findFirst:jest.fn().mockResolvedValue({userId:'user-1'})},$transaction:jest.fn(async(cb:any)=>cb({$queryRaw:queryRaw}))} as unknown as PrismaService;
    const context={getContext:()=>({tenantId:'tenant-1',companyId:'company-1',membershipId:'membership-1',branchId:null,roleScope:'COMPANY'})} as unknown as TenantContext;
    const audit={record:jest.fn()} as unknown as PlatformAuditService;
    const service=new ApprovalRuntimeService(prisma,context,audit);
    await expect(service.act('req-1','APPROVE')).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
