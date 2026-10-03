import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
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

  it('returns safe normalized day details with reversal-aware settlement amounts', async () => {
    const queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'income-1',
          transactionDate: new Date('2026-09-10T09:00:00.000Z'),
          counterpartyName: 'Kurumsal Müşteri',
          description: 'Hizmet geliri',
          grossAmount: 1000,
          currency: 'EUR',
          exchangeRate: 2,
          collectedAmount: 600,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'expense-1',
          transactionDate: new Date('2026-09-10T11:00:00.000Z'),
          counterpartyName: 'Tedarikçi',
          description: 'Sarf malzeme',
          grossAmount: 500,
          withholdingAmount: 50,
          currency: 'USD',
          exchangeRate: 2,
          paidAmount: 300,
        },
      ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FinanceReportingService,
        {
          provide: PrismaService,
          useValue: { $queryRawUnsafe: queryRawUnsafe },
        },
        {
          provide: TenantContext,
          useValue: {
            getTenantId: jest.fn().mockReturnValue('tenant-1'),
            getCompanyId: jest.fn().mockReturnValue('company-1'),
            getBranchId: jest.fn().mockReturnValue('branch-1'),
          },
        },
      ],
    }).compile();
    const service = moduleRef.get(FinanceReportingService);
    const range = {
      from: new Date('2026-09-10T00:00:00.000Z'),
      to: new Date('2026-09-10T23:59:59.999Z'),
    };

    const result = await service.dayDetails(range);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    for (const call of queryRawUnsafe.mock.calls) {
      expect(call.slice(1)).toEqual([
        'tenant-1',
        'company-1',
        'branch-1',
        range.from,
        range.to,
      ]);
    }
    expect(queryRawUnsafe.mock.calls[0][0]).toContain(
      'income_collection_reversals',
    );
    expect(queryRawUnsafe.mock.calls[1][0]).toContain(
      'expense_payment_reversals',
    );
    expect(result).toEqual([
      {
        id: 'income-1',
        recordType: 'INCOME',
        transactionDate: new Date('2026-09-10T09:00:00.000Z'),
        counterpartyName: 'Kurumsal Müşteri',
        description: 'Hizmet geliri',
        currency: 'EUR',
        exchangeRate: 2,
        grossTry: 2000,
        settlementBaseTry: 2000,
        settledTry: 1200,
        outstandingTry: 800,
      },
      {
        id: 'expense-1',
        recordType: 'EXPENSE',
        transactionDate: new Date('2026-09-10T11:00:00.000Z'),
        counterpartyName: 'Tedarikçi',
        description: 'Sarf malzeme',
        currency: 'USD',
        exchangeRate: 2,
        grossTry: 1000,
        settlementBaseTry: 900,
        settledTry: 600,
        outstandingTry: 300,
      },
    ]);
  });
});
