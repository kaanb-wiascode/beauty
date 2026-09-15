import { FinanceReconciliationService } from './finance-reconciliation.service';

describe('FinanceReconciliationService', () => {
  const tenant = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
    getBranchId: jest.fn(() => 'branch-1'),
  };

  it('scopes expense payment suggestions and scores exact-day candidates conservatively', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'payment-1',
            amount: 125,
            currency: 'TRY',
            branchId: 'branch-1',
            aggregateId: 'expense-1',
            occurredAt: new Date('2026-09-15T10:00:00Z'),
            reference: 'INV-42',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'bank-1',
            amount: -125,
            currency: 'TRY',
            description: 'INV-42 payment',
            dayDistance: 0,
          },
        ]),
    };

    const service = new FinanceReconciliationService(prisma as never, tenant as never);
    const result = await service.suggestExpensePayment('payment-1', 3);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].confidence).toBe(100);
    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'payment-1',
      'tenant-1',
      'company-1',
      'branch-1',
    ]);
    expect(prisma.$queryRawUnsafe.mock.calls[1]).toEqual(
      expect.arrayContaining(['tenant-1', 'company-1', 'branch-1', 'TRY', -125]),
    );
  });

  it('does not auto-match when the best bank candidates are equally confident', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          { targetType: 'INCOME_COLLECTION', targetId: 'collection-1' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'collection-1',
            amount: 250,
            currency: 'TRY',
            branchId: 'branch-1',
            aggregateId: 'income-1',
            occurredAt: new Date('2026-09-15T10:00:00Z'),
            reference: null,
          },
        ])
        .mockResolvedValueOnce([
          { id: 'bank-1', amount: 250, currency: 'TRY', dayDistance: 0.2 },
          { id: 'bank-2', amount: 250, currency: 'TRY', dayDistance: 0.3 },
        ]),
    };

    const service = new FinanceReconciliationService(prisma as never, tenant as never);
    const result = await service.autoMatch('actor-1', 10);

    expect(result).toEqual({
      scanned: 1,
      matched: 0,
      ambiguous: 1,
      noCandidate: 0,
      conflicted: 0,
    });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
  });
});
