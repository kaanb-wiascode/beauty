import { BadRequestException } from '@nestjs/common';
import { PayrollAccountingService } from './payroll-accounting.service';

describe('PayrollAccountingService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('rejects a payroll item when net pay does not reconcile',async()=>{
    const prisma={$transaction:jest.fn()} as never;
    const service=new PayrollAccountingService(prisma,tenant);
    await expect(service.upsertItem('period-a',{
      staffId:'staff-a',branchId:'branch-a',grossAmount:10000,netAmount:9000,
      incomeTax:1000,stampTax:100,employeeSocialSecurity:1400,unemploymentEmployee:100,
      employerSocialSecurity:2050,unemploymentEmployer:200,otherDeductions:0,employerCost:12250,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects employer cost that does not match gross plus employer contributions',async()=>{
    const prisma={$transaction:jest.fn()} as never;
    const service=new PayrollAccountingService(prisma,tenant);
    await expect(service.upsertItem('period-a',{
      staffId:'staff-a',branchId:'branch-a',grossAmount:10000,netAmount:7400,
      incomeTax:1000,stampTax:100,employeeSocialSecurity:1400,unemploymentEmployee:100,
      employerSocialSecurity:2050,unemploymentEmployer:200,otherDeductions:0,employerCost:12000,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a balanced payroll snapshot and scopes the period to company',async()=>{
    const query=jest.fn()
      .mockResolvedValueOnce([{id:'period-a',status:'DRAFT'}])
      .mockResolvedValueOnce([{id:'item-a'}]);
    const execute=jest.fn().mockResolvedValue(1);
    const tx={
      $queryRawUnsafe:query,$executeRawUnsafe:execute,
      staff:{findFirst:jest.fn().mockResolvedValue({id:'staff-a'})},
    };
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new PayrollAccountingService(prisma,tenant);
    await expect(service.upsertItem('period-a',{
      staffId:'staff-a',branchId:'branch-a',grossAmount:10000,netAmount:7400,
      incomeTax:1000,stampTax:100,employeeSocialSecurity:1400,unemploymentEmployee:100,
      employerSocialSecurity:2050,unemploymentEmployer:200,otherDeductions:0,employerCost:12250,
    })).resolves.toEqual({id:'item-a'});
    expect(String(query.mock.calls[0][0])).toContain('company_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['period-a','tenant-a','company-a']);
  });
});
