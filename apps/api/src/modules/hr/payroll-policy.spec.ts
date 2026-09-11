import { BadRequestException } from '@nestjs/common';
import { PayrollPolicyService } from './payroll-policy.service';

describe('PayrollPolicyService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('returns a disabled no-effect policy when company settings do not exist',async()=>{
    const prisma={$queryRawUnsafe:jest.fn().mockResolvedValue([])} as never;
    const service=new PayrollPolicyService(prisma,tenant);
    await expect(service.getSettings()).resolves.toMatchObject({enabled:false,applyOvertime:false,applyUnpaidLeaveDeduction:false});
  });

  it('requires explicit overtime calculation inputs before enabling overtime policy',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()} as never;
    const service=new PayrollPolicyService(prisma,tenant);
    await expect(service.updateSettings({enabled:true,applyOvertime:true,applyUnpaidLeaveDeduction:false,standardMonthlyMinutes:null,overtimeMultiplier:null},'user-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an explicit monthly day divisor before enabling unpaid leave deduction',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()} as never;
    const service=new PayrollPolicyService(prisma,tenant);
    await expect(service.updateSettings({enabled:true,applyOvertime:false,applyUnpaidLeaveDeduction:true,monthlyDayDivisor:null},'user-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores policy settings in exact tenant and company scope',async()=>{
    const query=jest.fn().mockResolvedValue([{enabled:true,applyOvertime:true,applyUnpaidLeaveDeduction:true,standardMonthlyMinutes:13500,overtimeMultiplier:1.5,monthlyDayDivisor:30}]);
    const prisma={$queryRawUnsafe:query} as never;
    const service=new PayrollPolicyService(prisma,tenant);
    await service.updateSettings({enabled:true,applyOvertime:true,applyUnpaidLeaveDeduction:true,standardMonthlyMinutes:13500,overtimeMultiplier:1.5,monthlyDayDivisor:30},'user-a');
    expect(String(query.mock.calls[0][0])).toContain('ON CONFLICT(tenant_id,company_id)');
    expect(query.mock.calls[0].slice(1,3)).toEqual(['tenant-a','company-a']);
  });
});
