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

  it('does not expose branchless liability payments to restricted company scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const tx = { $queryRawUnsafe: query };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new PayrollPaymentReversalService(prisma, tenant, scope);

    await expect(service.reverseLiabilityPayment('liab-a', 'user-a', 'duplicate reversal')).rejects.toThrow(
      'Payroll liability payment not found.',
    );
    expect(query.mock.calls[0][0]).not.toContain('branch_id IS NULL');
    expect(query.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });
});
