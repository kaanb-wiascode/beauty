import { TreasuryRiskService } from './treasury-risk.service';

describe('TreasuryRiskService liquidity position', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
  }

  it('computes reporting-currency bank variance and POS settlement forecast', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([
        { code: '100', amount: '1000.25' },
        { code: '102', amount: '5000.50' },
        { code: '108', amount: '2500.75' },
      ])
      .mockResolvedValueOnce([
        { currency: 'TRY', currentBalance: '4800.25', availableBalance: '4700.00', balanceAsOf: new Date('2026-09-11T06:00:00.000Z'), accountCount: 2 },
        { currency: 'USD', currentBalance: '120.50', availableBalance: '100.50', balanceAsOf: new Date('2026-09-11T06:05:00.000Z'), accountCount: 1 },
      ])
      .mockResolvedValueOnce([
        { currency: 'TRY', settlementDate: '2026-09-12', grossAmount: '1000.00', feeAmount: '25.00', netAmount: '975.00', transactionCount: 3 },
        { currency: 'TRY', settlementDate: '2026-09-10', grossAmount: '500.00', feeAmount: '10.00', netAmount: '490.00', transactionCount: 1 },
      ])
      .mockResolvedValueOnce([
        { currency: 'TRY', netAmount: '200.00', transactionCount: 2 },
      ])
      .mockResolvedValueOnce([
        { minimumLiquidity: '1000', warningBufferPercent: '20', reportingCurrency: 'TRY' },
      ]);
    const service = new TreasuryRiskService({ $queryRawUnsafe: query } as never, tenant(), {} as never);
    const asOf = new Date('2026-09-11T09:00:00.000Z');

    const result = await service.liquidityPosition(asOf);

    expect(result.book).toEqual({
      cashOnHand: 1000.25,
      bankBalance: 5000.5,
      actualCash: 6000.75,
      posReceivables: 2500.75,
      nearCash: 2500.75,
      totalLiquidPosition: 8501.5,
    });
    expect(result.reportingCurrency).toBe('TRY');
    expect(result.reconciliation.bankVariance).toEqual(expect.objectContaining({
      currency: 'TRY',
      bookBalance: 5000.5,
      providerCurrentBalance: 4800.25,
      variance: -200.25,
      comparable: true,
      reason: null,
    }));
    expect(result.posSettlementForecast.scheduled).toEqual([
      expect.objectContaining({ settlementDate: '2026-09-12', expectedNetCash: 975, transactionCount: 3, overdue: false }),
      expect.objectContaining({ settlementDate: '2026-09-10', expectedNetCash: 490, transactionCount: 1, overdue: true }),
    ]);
    expect(result.posSettlementForecast.unknownTiming).toEqual([
      { currency: 'TRY', expectedNetCash: 200, transactionCount: 2 },
    ]);
    expect(String(query.mock.calls[0][0])).toContain("coa.code IN ('100','102','108')");
    expect(String(query.mock.calls[2][0])).toContain("status='CAPTURED' AND settled_at IS NULL");
    expect(String(query.mock.calls[4][0])).toContain('reporting_currency AS "reportingCurrency"');
  });

  it('does not invent a bank variance without a configured reporting currency', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ code: '102', amount: '5000' }])
      .mockResolvedValueOnce([{ currency: 'TRY', currentBalance: '4900', availableBalance: '4900', accountCount: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new TreasuryRiskService({ $queryRawUnsafe: query } as never, tenant(null), {} as never);

    const result = await service.liquidityPosition(new Date('2026-09-11T09:00:00.000Z'));

    expect(result.reconciliation.bankVariance).toEqual(expect.objectContaining({
      comparable: false,
      variance: null,
      reason: 'REPORTING_CURRENCY_NOT_CONFIGURED',
    }));
  });

  it('returns zero book balances when accounts have no posted balance', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new TreasuryRiskService({ $queryRawUnsafe: query } as never, tenant(null), {} as never);

    const result = await service.liquidityPosition(new Date('2026-09-11T09:00:00.000Z'));
    expect(result.book.actualCash).toBe(0);
    expect(result.book.nearCash).toBe(0);
    expect(result.book.totalLiquidPosition).toBe(0);
    expect(result.provider.bankBalancesByCurrency).toEqual([]);
    expect(result.posSettlementForecast.scheduled).toEqual([]);
  });
});
