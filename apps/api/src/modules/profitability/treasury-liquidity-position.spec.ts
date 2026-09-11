import { TreasuryRiskService } from './treasury-risk.service';

describe('TreasuryRiskService liquidity position', () => {
  it('keeps book liquidity and provider bank balances distinct by currency', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([
        { code: '100', amount: '1000.25' },
        { code: '102', amount: '5000.50' },
        { code: '108', amount: '2500.75' },
      ])
      .mockResolvedValueOnce([
        { currency: 'TRY', currentBalance: '4800.25', availableBalance: '4700.00', balanceAsOf: new Date('2026-09-11T06:00:00.000Z'), accountCount: 2 },
        { currency: 'USD', currentBalance: '120.50', availableBalance: '100.50', balanceAsOf: new Date('2026-09-11T06:05:00.000Z'), accountCount: 1 },
      ]);
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const cashFlow = {} as never;
    const service = new TreasuryRiskService(prisma, tenant, cashFlow);
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
    expect(result.provider.bankBalancesByCurrency).toEqual([
      expect.objectContaining({ currency: 'TRY', currentBalance: 4800.25, availableBalance: 4700, accountCount: 2 }),
      expect.objectContaining({ currency: 'USD', currentBalance: 120.5, availableBalance: 100.5, accountCount: 1 }),
    ]);
    expect(String(query.mock.calls[0][0])).toContain("coa.code IN ('100','102','108')");
    expect(String(query.mock.calls[1][0])).toContain('tenant_id=$1::text');
    expect(query.mock.calls[1].slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a']);
  });

  it('returns zero book balances when accounts have no posted balance', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const service = new TreasuryRiskService(
      { $queryRawUnsafe: query } as never,
      {
        getTenantId: jest.fn().mockReturnValue('tenant-a'),
        getCompanyId: jest.fn().mockReturnValue('company-a'),
        getBranchId: jest.fn().mockReturnValue(null),
      } as never,
      {} as never,
    );

    const result = await service.liquidityPosition(new Date('2026-09-11T09:00:00.000Z'));
    expect(result.book.actualCash).toBe(0);
    expect(result.book.nearCash).toBe(0);
    expect(result.book.totalLiquidPosition).toBe(0);
    expect(result.provider.bankBalancesByCurrency).toEqual([]);
  });
});
