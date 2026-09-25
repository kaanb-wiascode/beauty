import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { BusinessPolicyService } from './business-policy.service';

describe('BusinessPolicyService',()=>{
  const queryRaw=jest.fn();
  const prisma={$queryRaw:queryRaw} as unknown as PrismaService;
  const tenantContext={getContext:()=>({tenantId:'tenant-1',companyId:'company-1',membershipId:'membership-1',branchId:null,roleScope:'CENTRAL'})} as unknown as TenantContext;
  const audit={record:jest.fn()} as unknown as PlatformAuditService;
  const service=new BusinessPolicyService(prisma,tenantContext,audit);

  beforeEach(()=>jest.clearAllMocks());

  it('allows when no published policy exists',async()=>{
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.evaluate({policyKey:'refund-limit',facts:{amount:500}})).resolves.toEqual({matched:false,allowed:true,reason:'NO_POLICY'});
  });

  it('rejects amounts above published maximum',async()=>{
    queryRaw.mockResolvedValueOnce([{id:'policy-1',version:3,rules:{maxAmount:1000}}]);
    await expect(service.evaluate({policyKey:'refund-limit',facts:{amount:1500}})).resolves.toEqual({matched:true,allowed:false,reason:'MAX_AMOUNT_EXCEEDED',policyId:'policy-1',version:3});
  });
});
