import { ConflictException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService paid appointment integrity', () => {
  function createService(paymentStatus = 'COMPLETED') {
    const appointment = {
      id: 'appointment-a',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      customerId: 'customer-a',
      staffId: 'staff-a',
      serviceId: 'service-a',
      status: 'SCHEDULED',
      startAt: new Date('2026-10-12T10:00:00.000Z'),
      endAt: new Date('2026-10-12T11:00:00.000Z'),
      session: null,
      payment: { id: 'payment-a', status: paymentStatus },
    };
    const prisma = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue(appointment),
        update: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ locked: 1 }]),
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    } as any;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
    } as any;
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-a',
        branchId: 'branch-a',
      }),
    } as any;
    const service = new AppointmentsService(
      prisma,
      tenant,
      organizationScope,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('does not reassign the customer of an appointment with recorded payment', async () => {
    const { service, prisma } = createService();

    await expect(service.update('appointment-a', {
      customerId: 'customer-b',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          session: true,
          payment: { select: { id: true, status: true } },
        },
      }),
    );
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('does not change the purchased service after a payment is recorded', async () => {
    const { service, prisma } = createService();

    await expect(service.update('appointment-a', {
      serviceId: 'service-b',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('requires a refund before cancellation via PATCH', async () => {
    const { service, prisma } = createService();

    await expect(service.update('appointment-a', {
      status: 'CANCELLED',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('requires a refund before cancellation via DELETE', async () => {
    const { service, prisma } = createService();

    await expect(service.remove('appointment-a'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});
