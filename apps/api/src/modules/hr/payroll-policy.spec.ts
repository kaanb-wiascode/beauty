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

  it('calculates overtime addition and unpaid leave deduction from explicit company policy',async()=>{
    const query=jest.fn().mockResolvedValue([{staffId:'staff-a',firstName:'A',lastName:'B',branchId:'branch-a',configuredGrossSalary:30000,overtimeMinutes:600,unpaidLeaveDays:2}]);
    const prisma={$queryRawUnsafe:query} as never;
    const service=new PayrollPolicyService(prisma,tenant);
    jest.spyOn(service,'getSettings').mockResolvedValue({enabled:true,applyOvertime:true,applyUnpaidLeaveDeduction:true,standardMonthlyMinutes:12000,overtimeMultiplier:1.5,monthlyDayDivisor:30,updatedAt:null});
    const result=await service.preview(2026,9);
    expect(result.staff[0]).toMatchObject({baseGross:30000,overtimeAddition:2250,unpaidLeaveDeduction:2000,proposedGross:30250,delta:250,policyApplied:true});
  });
});
