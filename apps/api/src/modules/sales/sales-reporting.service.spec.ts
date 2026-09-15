import { SalesReportingService } from './sales-reporting.service';

describe('SalesReportingService', () => {
  it('uses branch scope and keeps revenue, collection, refund and outstanding distinct', async () => {
    const prisma = {
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sale-1',
            branchId: 'branch-1',
            confirmedAt: new Date('2026-09-10T10:00:00.000Z'),
            subtotal: 1500,
            discountTotal: 100,
            total: 1400,
            customer: { firstName: 'Ada', lastName: 'Yılmaz' },
            items: [
              { type: 'SERVICE', quantity: 1 },
              { type: 'PACKAGE', quantity: 2 },
            ],
            payments: [
              { amount: 800, status: 'COMPLETED' },
              { amount: 200, status: 'REFUNDED' },
            ],
          },
        ]),
      },
    };
    const organizationScope = {
      getBranchScopedWhere: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-1', branchId: 'branch-1' }),
    };
    const service = new SalesReportingService(
      prisma as never,
      organizationScope as never,
    );

    const result = await service.performance({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T23:59:59.999Z'),
    });

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          status: 'CONFIRMED',
          confirmedAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sale-1',
        customerName: 'Ada Yılmaz',
        revenue: 1400,
        collected: 800,
        refunded: 200,
        netCollected: 600,
        outstanding: 600,
        itemCount: 3,
        serviceQuantity: 1,
        packageQuantity: 2,
      }),
    ]);
  });
});
