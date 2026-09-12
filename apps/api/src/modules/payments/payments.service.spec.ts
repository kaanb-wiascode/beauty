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
});
