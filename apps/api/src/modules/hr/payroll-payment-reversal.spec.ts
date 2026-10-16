import { PayrollPaymentReversalService } from './payroll-payment-reversal.service';

describe('PayrollPaymentReversalService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
    getBranchId: () => null,
    getRoleScope: () => 'COMPANY',
  } as never;
  const scope = { getAssignedActiveBranchIds: jest.fn().mockResolvedValue(['branch-a', 'branch-b']) } as never;

  it('returns duplicate for an already reversed salary payment inside assigned branches', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { id: 'pay-a', status: 'REVERSED', reversalJournalEntryId: 'je-r' },
    ]);
    const tx = { $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollPaymentReversalService(prisma, tenant, scope);

    await expect(service.reverseSalaryPayment('pay-a', 'user-a', 'duplicate reversal')).resolves.toEqual({
      paymentId: 'pay-a',
      status: 'REVERSED',
      journalEntryId: 'je-r',
      duplicate: true,
    });
    expect(query.mock.calls[0][0]).toContain('branch_id=ANY($4::text[])');
    expect(query.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });


  it('reopens the payroll payment queue and clears paid notification after reversal', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: 'pay-a',
        branchId: 'branch-a',
        periodId: 'period-a',
        staffId: 'staff-a',
        amount: '300.02',
        status: 'PAID',
        journalEntryId: 'je-paid',
        reversalJournalEntryId: null,
      }])
      .mockResolvedValueOnce([{ status: 'POSTED', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{
        id: 'queue-a',
        amountDue: '1000.01',
        amountPaid: '1000.01',
      }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'je-paid',
          lines: [{ accountId: 'acc-1', debit: 300.02, credit: 0, memo: 'payment' }],
        }),
        create: jest.fn().mockResolvedValue({ id: 'je-reversal' }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollPaymentReversalService(prisma, tenant, scope);

    await expect(service.reverseSalaryPayment('pay-a', 'user-a', 'ödeme ters kayıt')).resolves.toEqual({
      paymentId: 'pay-a',
      status: 'REVERSED',
      journalEntryId: 'je-reversal',
      duplicate: false,
    });

    expect(query.mock.calls[2][0]).toContain('hr_payroll_payment_queue');
    const queueUpdate=execute.mock.calls.find((call)=>String(call[0]).includes('UPDATE hr_payroll_payment_queue'));
    expect(queueUpdate?.[2]).toBe(699.99);
    expect(queueUpdate?.[3]).toBe(300.02);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('UPDATE hr_payroll_payment_queue'))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('DELETE FROM hr_employee_notifications'))).toBe(true);
  });

  it('does not expose branchless liability payments to restricted company scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const tx = { $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollPaymentReversalService(prisma, tenant, scope);

    await expect(service.reverseLiabilityPayment('liab-a', 'user-a', 'duplicate reversal')).rejects.toThrow(
      'Bordro yükümlülük ödemesi bulunamadı.',
    );
    expect(query.mock.calls[0][0]).not.toContain('branch_id IS NULL');
    expect(query.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });
});
