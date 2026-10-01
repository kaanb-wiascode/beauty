import { BadRequestException } from '@nestjs/common';
import { PayrollReversalService } from './payroll-reversal.service';

describe('PayrollReversalService', () => {
  const tenant = {
    getTenantId: () => 'tenant-a',
    getCompanyId: () => 'company-a',
    getBranchId: () => null,
    getRoleScope: () => 'COMPANY',
  } as never;
  const scope = { getAssignedActiveBranchIds: jest.fn().mockResolvedValue(['branch-a', 'branch-b']) } as never;

  it('blocks reversal when payroll settlements exist inside assigned scope', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'period-a', year: 2026, month: 9, status: 'POSTED', branchId: 'branch-a', journalEntryId: 'je-a' },
      ])
      .mockResolvedValueOnce([{ salary_count: 1, liability_count: 0 }]);
    const prisma: any = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'period-a', status: 'POSTED', branchId: 'branch-a' }])
        .mockResolvedValueOnce([{ roleSlug: 'owner', roleName: 'Owner' }]),
      $transaction: jest.fn(async (fn: any) => fn({ $queryRawUnsafe: transactionQuery })),
    };
    const service = new PayrollReversalService(prisma, tenant, scope);

    await expect(service.reverse('period-a', 'user-a', 'Yanlış bordro kaydı')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain('branch_id=ANY($4::text[])');
    expect(prisma.$queryRawUnsafe.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
    expect(transactionQuery.mock.calls[0][4]).toEqual(['branch-a', 'branch-b']);
  });

  it('restores applied compensation requests after payroll reversal', async () => {
    const transactionQuery = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'period-a', year: 2026, month: 10, status: 'POSTED', branchId: 'branch-a', journalEntryId: 'je-a' },
      ])
      .mockResolvedValueOnce([{ salary_count: 0, liability_count: 0 }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = {
      $queryRawUnsafe: transactionQuery,
      $executeRawUnsafe: execute,
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'je-a',
          lines: [{ accountId: 'acc-a', debit: 1000, credit: 0, memo: 'bordro' }],
        }),
        create: jest.fn().mockResolvedValue({ id: 'je-reversal' }),
      },
    };
    const prisma: any = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'period-a', status: 'POSTED', branchId: 'branch-a' }])
        .mockResolvedValueOnce([{ roleSlug: 'owner', roleName: 'Owner' }]),
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new PayrollReversalService(prisma, tenant, scope);

    await expect(service.reverse('period-a', 'user-a', 'Bordro ters kayıt nedeni')).resolves.toEqual({
      periodId: 'period-a',
      status: 'REVERSED',
      journalEntryId: 'je-reversal',
      duplicate: false,
    });

    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes("UPDATE hr_compensation_requests") &&
        String(call[0]).includes("status='APPROVED'"),
      ),
    ).toBe(true);
  });

  it('does not expose branchless periods to restricted company scope', async () => {
    const prisma: any = { $queryRawUnsafe: jest.fn().mockResolvedValue([]), $transaction: jest.fn() };
    const service = new PayrollReversalService(prisma, tenant, scope);

    await expect(service.reverse('period-global', 'user-a', 'Tekrar kontrol')).rejects.toThrow(
      'Payroll period not found.',
    );
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).not.toContain('branch_id IS NULL');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not allow posted payroll to be cancelled', async () => {
    const prisma: any = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'period-a', status: 'POSTED', branchId: 'branch-a' }]),
    };
    const service = new PayrollReversalService(prisma, tenant, scope);
    await expect(service.cancel('period-a', 'user-a', 'İptal nedeni')).rejects.toBeInstanceOf(BadRequestException);
  });
});
