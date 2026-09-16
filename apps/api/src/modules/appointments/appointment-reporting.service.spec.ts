import { AppointmentReportingService } from './appointment-reporting.service';

describe('AppointmentReportingService', () => {
  it('keeps scope, status and rebooking semantics deterministic', async () => {
    const prisma = {
      appointment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'a1', customerId: 'c1',
              startAt: new Date('2026-09-10T09:00:00.000Z'),
              endAt: new Date('2026-09-10T10:00:00.000Z'),
              status: 'COMPLETED', payment: { amount: 500, status: 'COMPLETED' },
            },
            {
              id: 'a2', customerId: 'c2',
              startAt: new Date('2026-09-10T10:00:00.000Z'),
              endAt: new Date('2026-09-10T10:30:00.000Z'),
              status: 'NO_SHOW', payment: null,
            },
            {
              id: 'a3', customerId: 'c1',
              startAt: new Date('2026-09-10T09:30:00.000Z'),
              endAt: new Date('2026-09-10T10:30:00.000Z'),
              status: 'COMPLETED', payment: null,
            },
          ])
          .mockResolvedValueOnce([
            { id: 'a1', customerId: 'c1', startAt: new Date('2026-09-10T09:00:00.000Z') },
            { id: 'a3', customerId: 'c1', startAt: new Date('2026-09-10T09:30:00.000Z') },
            { id: 'a4', customerId: 'c1', startAt: new Date('2026-10-01T09:00:00.000Z') },
          ]),
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'c1', _min: { startAt: new Date('2026-09-10T09:00:00.000Z') } },
          { customerId: 'c2', _min: { startAt: new Date('2026-08-01T09:00:00.000Z') } },
        ]),
      },
    };
    const organizationScope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      }),
    };
    const service = new AppointmentReportingService(
      prisma as never,
      organizationScope as never,
    );

    const result = await service.performance({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(prisma.appointment.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          startAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-09-10',
        appointmentCount: 3,
        completedCount: 2,
        noShowCount: 1,
        completionRate: 67,
        noShowRate: 33,
        uniqueCustomerCount: 2,
        newCustomerCount: 1,
        repeatCustomerCount: 2,
        completedCustomerCount: 1,
        rebookedCustomerCount: 1,
        rebookingRate: 100,
        collected: 500,
        averageDurationMinutes: 50,
        peakHour: 9,
      }),
    ]);
  });
});
