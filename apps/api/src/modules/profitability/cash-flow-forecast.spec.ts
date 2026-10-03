import { CashFlowForecastService } from './cash-flow-forecast.service';

describe('CashFlowForecastService Finance 2.0 sources', () => {
  function tenant() {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
  }

  it('builds the 13-week forecast from finance income and expense subledgers', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ amount: '1000' }])
      .mockResolvedValueOnce([
        { id: 'income-1', due_at: new Date('2026-10-02T00:00:00.000Z'), outstanding: '900' },
      ])
      .mockResolvedValueOnce([
        { id: 'expense-1', due_at: new Date('2026-10-03T00:00:00.000Z'), outstanding: '400' },
      ]);

    const prisma = {
      $queryRawUnsafe: query,
      company: {
        findFirst: jest.fn().mockResolvedValue({ baseCurrency: 'TRY' }),
      },
    };

    const service = new CashFlowForecastService(prisma as never, tenant());
    const result = await service.thirteenWeek(
      new Date('2026-09-29T00:00:00.000Z'),
      'BASE',
    );

    expect(result.baseCurrency).toBe('TRY');
    expect(result.openingLiquidity).toBe(1000);
    expect(result.weeks[0]).toEqual(expect.objectContaining({
      projectedInflows: 810,
      projectedOutflows: 400,
      netCashFlow: 410,
      closingLiquidity: 1410,
    }));

    expect(String(query.mock.calls[1][0])).toContain('FROM income_records i');
    expect(String(query.mock.calls[1][0])).toContain('FROM income_collections c');
    expect(String(query.mock.calls[2][0])).toContain('FROM expenses e');
    expect(String(query.mock.calls[2][0])).toContain('FROM expense_payments p');
    expect(String(query.mock.calls[1][0])).not.toContain('FROM installments');
    expect(String(query.mock.calls[2][0])).not.toContain('FROM supplier_bills');
  });
});
