import { PayrollPaymentReversalService } from './payroll-payment-reversal.service';

describe('PayrollPaymentReversalService',()=>{
  const tenant={getTenantId:()=> 'tenant-a',getCompanyId:()=> 'company-a',getBranchId:()=> 'branch-a'} as never;

  it('returns duplicate for an already reversed salary payment',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:'pay-a',status:'REVERSED',reversalJournalEntryId:'je-r'}]);
    const tx={$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new PayrollPaymentReversalService(prisma,tenant);
    await expect(service.reverseSalaryPayment('pay-a','user-a','duplicate reversal')).resolves.toEqual({paymentId:'pay-a',status:'REVERSED',journalEntryId:'je-r',duplicate:true});
  });

  it('returns duplicate for an already reversed liability payment',async()=>{
    const query=jest.fn().mockResolvedValueOnce([{id:'liab-a',status:'REVERSED',reversalJournalEntryId:'je-r'}]);
    const tx={$queryRawUnsafe:query};
    const prisma={$transaction:jest.fn(async(fn:any)=>fn(tx))} as never;
    const service=new PayrollPaymentReversalService(prisma,tenant);
    await expect(service.reverseLiabilityPayment('liab-a','user-a','duplicate reversal')).resolves.toEqual({paymentId:'liab-a',status:'REVERSED',journalEntryId:'je-r',duplicate:true});
  });
});
