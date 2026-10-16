import { PosFinancialEventsService } from './pos-financial-events.service';

describe('PosFinancialEventsService accounting integrity', () => {
  it('rejects refund plus chargeback totals above the original POS amount', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{
          id: 'pos-1',
          status: 'CAPTURED',
          amount: 100,
          settledAt: null,
          salePaymentId: null,
          saleId: null,
          branchId: 'branch-a',
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 60, hasChargeback: true }]),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const service = new PosFinancialEventsService(prisma, tenant);

    await expect(service.record('pos-1', {
      eventType: 'REFUND',
      externalEventId: 'refund-2',
      amount: 50,
      occurredAt: new Date('2026-09-10T17:00:00.000Z'),
    })).rejects.toThrow('Combined refunds and chargebacks cannot exceed');
  });
});
