import { FinanceReportingService } from './finance-reporting.service';

describe('FinanceReportingService', () => {
  it('keeps branch scope, reversal exclusion and payable semantics deterministic', async () => {
    const queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([
        {
          transactionDate: new Date('2026-09-10T10:00:00.000Z'),
          grossAmount: 1000,
          exchangeRate: 2,
          collectedAmount: 600,
        },
      ])
      .mockResolvedValueOnce([
        {
          transactionDate: new Date('2026-09-10T12:00:00.000Z'),
          grossAmount: 500,
          withholdingAmount: 50,
          exchangeRate: 2,
          paidAmount: 300,
        },
      ]);
    const prisma = { $queryRawUnsafe: queryRawUnsafe };
    const tenantContext = {
      getTenantId: jest.fn().mockReturnValue('tenant-1'),
      getCompanyId: jest.fn().mockReturnValue('company-1'),
      getBranchId: jest.fn().mockReturnValue('branch-1'),
    };
    const service = new FinanceReportingService(
      prisma as never,
      tenantContext as never,
    );

    const result = await service.performance({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    for (const call of queryRawUnsafe.mock.calls) {
      expect(call.slice(1, 4)).toEqual(['tenant-1', 'company-1', 'branch-1']);
    }
    expect(queryRawUnsafe.mock.calls[0][0]).toContain('income_collection_reversals');
    expect(queryRawUnsafe.mock.calls[0][0]).toContain('r.id IS NULL');
    expect(queryRawUnsafe.mock.calls[1][0]).toContain('expense_payment_reversals');
    expect(queryRawUnsafe.mock.calls[1][0]).toContain('r.id IS NULL');

    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-09-10',
        incomeRecognized: 2000,
        expenseRecognized: 1000,
        payableAmount: 900,
        operatingMargin: 1000,
        collected: 1200,
        paid: 600,
        netCashMovement: 600,
        receivableOutstanding: 800,
        payableOutstanding: 300,
        collectionRate: 60,
        paymentRate: 67,
        incomeRecordCount: 1,
        expenseRecordCount: 1,
      }),
    ]);
  });
});
