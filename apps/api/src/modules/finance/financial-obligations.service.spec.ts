import { FinancialObligationRulesService } from './financial-obligation-rules.service';
import { FinancialObligationsService } from './financial-obligations.service';

describe('Financial obligations', () => {
  const tenant = {
    getTenantId: jest.fn(() => 'tenant-1'),
    getCompanyId: jest.fn(() => 'company-1'),
    getBranchId: jest.fn(() => 'branch-1'),
  };

  it('refreshes due statuses inside tenant, company and branch scope', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new FinancialObligationsService(prisma as never, tenant as never);

    await expect(service.refreshDueStatuses()).resolves.toEqual({ due: 3, overdue: 2, updated: 5 });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    for (const call of tx.$executeRawUnsafe.mock.calls) {
      expect(call.slice(1)).toEqual(['tenant-1', 'company-1', 'branch-1']);
    }
  });

  it('scopes payment calendar entries and bounds the limit', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new FinancialObligationsService(prisma as never, tenant as never);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-10-31T00:00:00.000Z');

    await service.calendarEntries(from, to, 999);

    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'tenant-1', 'company-1', 'branch-1', from, to, 500,
    ]);
  });

  it('generates month-end recurring obligations idempotently across short months', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'rule-1', branchId: 'branch-1', name: 'Monthly rent', obligationType: 'RENT',
          counterparty: 'Landlord', amount: 10000, currency: 'TRY', frequency: 'MONTHLY',
          intervalCount: 1, dayOfMonth: 31, startDate: new Date('2026-01-31T00:00:00.000Z'),
          endDate: null, priority: 'HIGH', costCenterId: null, categoryId: null,
          description: null, isActive: true,
        },
      ]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const service = new FinancialObligationRulesService(prisma as never, tenant as never);

    const result = await service.generate(
      'rule-1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-03-31T00:00:00.000Z'),
      'actor-1',
    );

    expect(result).toEqual({ generated: 3, skipped: 0, occurrences: 3 });
    const periodKeys = prisma.$executeRawUnsafe.mock.calls.map((call) => call[6]);
    expect(periodKeys).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});
