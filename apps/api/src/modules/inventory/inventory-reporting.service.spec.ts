import { InventoryReportingService } from './inventory-reporting.service';

describe('InventoryReportingService', () => {
  it('uses warehouse scope and normalizes numeric movement aggregates', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          date: new Date('2026-09-15T00:00:00.000Z'),
          movementType: 'PURCHASE',
          movementCount: 2,
          quantity: '5.50',
          movementValue: '1250.75',
        },
      ]),
    };
    const inventoryScope = {
      getWarehouseScope: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchIds: ['branch-1'],
      }),
    };
    const service = new InventoryReportingService(prisma as any, inventoryScope as any);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const rows = await service.performance({ from, to });

    expect(inventoryScope.getWarehouseScope).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('m.tenant_id=$1::text'),
      'tenant-1',
      'company-1',
      ['branch-1'],
      from,
      to,
    );
    expect(rows).toEqual([
      {
        date: '2026-09-15',
        movementType: 'PURCHASE',
        movementCount: 2,
        quantity: 5.5,
        movementValue: 1250.75,
      },
    ]);
  });
});
