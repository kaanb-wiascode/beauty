import { PayrollCostCenterAccountingService } from './payroll-cost-center-accounting.service';

describe('PayrollCostCenterAccountingService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('splits the payroll expense line by cost center and links allocated lines',async()=>{
    const execute=jest.fn().mockResolvedValue(1);
    const createLine=jest.fn()
      .mockResolvedValueOnce({id:'line-cc1'})
      .mockResolvedValueOnce({id:'line-unallocated'});
    const query=jest.fn()
      .mockResolvedValueOnce([{id:'period-a',status:'POSTED',branchId:'branch-a',journalEntryId:'je-a'}])
      .mockResolvedValueOnce([{costCenterId:'cc-1',amount:700},{costCenterId:null,amount:300}])
      .mockResolvedValueOnce([{id:'cc-1'}]);
    const tx:any={
      $queryRawUnsafe:query,
      $executeRawUnsafe:execute,
      chartOfAccount:{findFirst:jest.fn().mockResolvedValue({id:'acc-770'})},
      journalEntryLine:{
        findMany:jest.fn().mockResolvedValue([{id:'old-line',debit:1000,credit:0}]),
        delete:jest.fn().mockResolvedValue({id:'old-line'}),
        create:createLine,
      },
    };
    const prisma:any={$transaction:jest.fn(async(fn:any)=>fn(tx))};
    const service=new PayrollCostCenterAccountingService(prisma,tenant);
    await expect(service.ensureSplit('period-a')).resolves.toEqual({periodId:'period-a',journalEntryId:'je-a',groups:2,duplicate:false});
    expect(createLine).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.some((c:any[])=>String(c[0]).includes('cost_center_expense_links'))).toBe(true);
  });
});
