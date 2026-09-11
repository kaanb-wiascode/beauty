import { BadRequestException } from '@nestjs/common';
import { PayrollWorkInputService } from './payroll-work-input.service';

describe('PayrollWorkInputService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('rejects invalid payroll periods before querying',async()=>{
    const prisma={$queryRawUnsafe:jest.fn()} as never;
    const service=new PayrollWorkInputService(prisma,tenant);
    await expect(service.preview(2026,13)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attaches attendance and leave inputs only to a draft payroll item',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:'period-a',year:2026,month:9,status:'DRAFT'}])
      .mockResolvedValueOnce([{id:'item-a',branchId:'branch-a',calculationSnapshot:{grossAmount:10000}}])
      .mockResolvedValueOnce([{workedMinutes:9600,overtimeMinutes:120,presentDays:20,absentDays:1,approvedLeaveRecords:1,declaredLeaveDays:1}]);
    const execute=jest.fn().mockResolvedValue(1);
    const tx={$queryRawUnsafe:query,$executeRawUnsafe:execute};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new PayrollWorkInputService(prisma,tenant);
    const result=await service.attachToDraft('period-a','staff-a');
    expect(result.workInputs.workedMinutes).toBe(9600);
    expect(String(execute.mock.calls[0][0])).toContain('calculation_snapshot');
    expect(JSON.parse(execute.mock.calls[0][2]).grossAmount).toBe(10000);
  });
});
