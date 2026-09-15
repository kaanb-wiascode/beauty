import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService concurrency guards', () => {
  function createService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'appointment-a',
          status: 'COMPLETED',
          service: { price: 100 },
        }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'payment-a',
          status: 'REFUNDED',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'payment-a',
          status: 'COMPLETED',
        }),
        create: jest.fn().mockResolvedValue({ id: 'payment-a' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      ...overrides,
    } as any;

    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
      getRoleScope: jest.fn().mockReturnValue('BRANCH'),
    } as any;

    return {
      service: new PaymentsService(prisma, tenant),
      prisma,
      tenant,
    };
  }

  it('maps a concurrent appointment payment unique violation to 409 Conflict', async () => {
    const { service, prisma } = createService();
    prisma.payment.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.create({
        appointmentId: 'appointment-a',
        amount: 100,
        method: 'CARD',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not hide unrelated database failures as duplicate payments', async () => {
    const { service, prisma } = createService();
    const databaseError = new Error('database unavailable');
    prisma.payment.create.mockRejectedValueOnce(databaseError);

    await expect(
      service.create({
        appointmentId: 'appointment-a',
        amount: 100,
        method: 'CARD',
      } as any),
    ).rejects.toBe(databaseError);
  });

  it('uses an atomic status transition when refunding a payment', async () => {
    const { service, prisma } = createService();

    await service.refund('payment-a', { reason: 'Customer request' } as any);

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'payment-a',
          status: { not: 'REFUNDED' },
        },
      }),
    );
    expect(prisma.payment.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'payment-a' },
    });
  });

  it('returns 409 when another request wins the refund race', async () => {
    const { service, prisma } = createService();
    prisma.payment.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.refund('payment-a', { reason: 'Customer request' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes branch payment summaries through appointment branch and tenant', async () => {
    const { service, prisma } = createService();
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 1200 }, _count: { _all: 3 } })
      .mockResolvedValueOnce({ _sum: { amount: 200 }, _count: { _all: 1 } });
    prisma.payment.groupBy.mockResolvedValue([]);

    const range = {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    };

    await service.summary(range);

    expect(prisma.payment.aggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          appointment: { branchId: 'branch-a' },
          status: 'COMPLETED',
          paidAt: { gte: range.from, lte: range.to },
        },
      }),
    );
    expect(prisma.payment.aggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          appointment: { branchId: 'branch-a' },
          status: 'REFUNDED',
          refundedAt: { gte: range.from, lte: range.to },
        },
      }),
    );
  });

  it('scopes central company-wide payment summaries to the authenticated company', async () => {
    const { service, prisma, tenant } = createService();
    tenant.getBranchId.mockReturnValue(null);
    tenant.getRoleScope.mockReturnValue('CENTRAL');
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: { _all: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: { _all: 0 } });
    prisma.payment.groupBy.mockResolvedValue([]);

    await service.summary({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(prisma.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          appointment: {
            branch: {
              companyId: 'company-a',
            },
          },
        }),
      }),
    );
  });

  it('keeps refunds separate from gross collections and derives net correctly', async () => {
    const { service, prisma } = createService();
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 1500 }, _count: { _all: 4 } })
      .mockResolvedValueOnce({ _sum: { amount: 250 }, _count: { _all: 1 } });
    prisma.payment.groupBy.mockResolvedValue([
      { method: 'CARD', _sum: { amount: 1000 } },
      { method: 'CASH', _sum: { amount: 500 } },
    ]);

    const result = await service.summary({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(result).toEqual({
      gross: 1500,
      refunds: 250,
      net: 1250,
      paymentCount: 4,
      refundCount: 1,
      methods: {
        CASH: 500,
        CARD: 1000,
        TRANSFER: 0,
      },
    });
  });
});
