import { BadRequestException } from '@nestjs/common';
import { FinancialObligationPaymentsService } from './financial-obligation-payments.service';

const tenant = {
  getTenantId: jest.fn(() => 'tenant-1'),
  getCompanyId: jest.fn(() => 'company-1'),
  getBranchId: jest.fn(() => 'branch-1'),
};

describe('FinancialObligationPaymentsService', () => {
  it('allocates the smaller residual and marks the obligation partially paid', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'obligation-1', amount: 1000, currency: 'TRY', status: 'READY_FOR_PAYMENT', branchId: 'branch-1' }])
        .mockResolvedValueOnce([{ id: 'payment-1', amount: 400, currency: 'TRY' }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ amount: 1000, allocated: 400 }])
        .mockResolvedValueOnce([{ id: 'allocation-1', amount: 400 }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new FinancialObligationPaymentsService(prisma as never, tenant as never);

    const result = await service.allocate('obligation-1', 'payment-1', undefined, 'actor-1');

    expect(result).toEqual({ id: 'allocation-1', amount: 400 });
    expect(tx.$executeRawUnsafe.mock.calls[0]).toEqual(expect.arrayContaining([400, 'actor-1']));
    expect(tx.$executeRawUnsafe.mock.calls[1]).toEqual(expect.arrayContaining(['obligation-1', 'PARTIALLY_PAID']));
  });

  it('rejects an allocation above either residual amount', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'obligation-1', amount: 1000, currency: 'TRY', status: 'READY_FOR_PAYMENT', branchId: 'branch-1' }])
        .mockResolvedValueOnce([{ id: 'payment-1', amount: 250, currency: 'TRY' }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ total: 0 }]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new FinancialObligationPaymentsService(prisma as never, tenant as never);

    await expect(service.allocate('obligation-1', 'payment-1', 300, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('reopens a fully reversed obligation allocation to ready for payment', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'allocation-1', obligationId: 'obligation-1', reversedAt: null }])
        .mockResolvedValueOnce([{ amount: 1000, allocated: 0 }])
        .mockResolvedValueOnce([{ id: 'allocation-1', reversedAt: new Date('2026-09-16T00:00:00Z') }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const service = new FinancialObligationPaymentsService(prisma as never, tenant as never);

    await service.reverse('allocation-1', 'actor-1', 'payment reversed');

    expect(tx.$executeRawUnsafe.mock.calls[1]).toEqual(expect.arrayContaining(['obligation-1', 'READY_FOR_PAYMENT']));
  });
});
