import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { ApprovalDelegationService } from './approval-delegation.service';

describe('ApprovalDelegationService',()=>{
  it('requires both users to be active members of the current company',async()=>{
    const prisma={membership:{findFirst:jest.fn().mockResolvedValue({userId:'admin-1'}),findMany:jest.fn().mockResolvedValue([{userId:'delegator-1'}])}} as unknown as PrismaService;
    const context={getContext:()=>({tenantId:'tenant-1',companyId:'company-1',membershipId:'membership-admin',branchId:null,roleScope:'CENTRAL'})} as unknown as TenantContext;
    const audit={record:jest.fn()} as unknown as PlatformAuditService;
    const service=new ApprovalDelegationService(prisma,context,audit);
    await expect(service.create({delegatorUserId:'delegator-1',delegateUserId:'delegate-2',startsAt:new Date(Date.now()+60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),reason:'Annual leave coverage'})).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
