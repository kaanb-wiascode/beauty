import { CustomerReportingService } from './customer-reporting.service';

describe('CustomerReportingService', () => {
  it('uses branch-scoped customer and appointment queries and aggregates only completed payments', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'customer-1',
            firstName: 'Ada',
            lastName: 'Yılmaz',
            branchId: 'branch-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            customerSource: 'REFERRAL',
          },
        ]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'appointment-1',
            customerId: 'customer-1',
            startAt: new Date('2026-09-01T10:00:00.000Z'),
            status: 'COMPLETED',
            payment: { amount: 1200, status: 'COMPLETED' },
          },
          {
            id: 'appointment-2',
            customerId: 'customer-1',
            startAt: new Date('2026-09-02T10:00:00.000Z'),
            status: 'CANCELLED',
            payment: { amount: 800, status: 'REFUNDED' },
          },
        ]),
      },
    };
    const organizationScope = {
      getBranchScopedWhere: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-1', branchId: 'branch-1' }),
    };
    const service = new CustomerReportingService(
      prisma as never,
      organizationScope as never,
    );

    const result = await service.performance({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(organizationScope.getBranchScopedWhere).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', branchId: 'branch-1' },
      }),
    );
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          startAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'customer-1',
        name: 'Ada Yılmaz',
        visitCount: 2,
        completedVisits: 1,
        collected: 1200,
        averageCollectedPerVisit: 1200,
        firstVisitAt: new Date('2026-09-01T10:00:00.000Z'),
        lastVisitAt: new Date('2026-09-01T10:00:00.000Z'),
      }),
    ]);
  });
});
