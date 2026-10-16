import { ProcurementReportingService } from './procurement-reporting.service';

describe('ProcurementReportingService', () => {
  it('uses authenticated company/branch scope and preserves order-level totals', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          date: new Date('2026-09-15T00:00:00.000Z'),
          status: 'RECEIVED',
          orderCount: 2,
          totalAmount: '2400.00',
          itemCount: 5,
          receivedCount: 2,
        },
      ]),
    };
    const tenantContext = {
      getTenantId: jest.fn(() => 'tenant-1'),
      getCompanyId: jest.fn(() => 'company-1'),
      getBranchId: jest.fn(() => 'branch-1'),
    };
    const service = new ProcurementReportingService(prisma as any, tenantContext as any);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const rows = await service.performance({ from, to });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WITH scoped_orders AS'),
      'tenant-1',
      'company-1',
      'branch-1',
      from,
      to,
    );
    expect(rows).toEqual([
      {
        date: '2026-09-15',
        status: 'RECEIVED',
        orderCount: 2,
        totalAmount: 2400,
        itemCount: 5,
        receivedCount: 2,
        receiptRate: 100,
      },
    ]);
  });
});
