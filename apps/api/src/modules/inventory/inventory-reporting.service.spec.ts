import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';

import { InventoryReportingService } from './inventory-reporting.service';
import { InventoryScopeService } from './inventory-scope.service';

describe('InventoryReportingService', () => {
  const queryRawUnsafe = jest.fn();
  const getWarehouseScope = jest.fn();
  let service: InventoryReportingService;

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    getWarehouseScope.mockReset().mockResolvedValue({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchIds: ['branch-1'],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryReportingService,
        {
          provide: PrismaService,
          useValue: { $queryRawUnsafe: queryRawUnsafe },
        },
        {
          provide: InventoryScopeService,
          useValue: { getWarehouseScope },
        },
      ],
    }).compile();

    service = moduleRef.get(InventoryReportingService);
  });

  it('uses warehouse scope and normalizes numeric movement aggregates', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        date: new Date('2026-09-15T00:00:00.000Z'),
        movementType: 'PURCHASE',
        movementCount: 2,
        quantity: '5.50',
        movementValue: '1250.75',
      },
    ]);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    const rows = await service.performance({ from, to });

    expect(getWarehouseScope).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('m.tenant_id=$1::text'),
      'tenant-1',
      'company-1',
      ['branch-1'],
      from,
      to,
    );
    expect(rows).toEqual([
      {
        id: '2026-09-15|PURCHASE',
        date: '2026-09-15',
        movementType: 'PURCHASE',
        movementCount: 2,
        quantity: 5.5,
        movementValue: 1250.75,
      },
    ]);
  });

  it('loads source movements only from the authenticated warehouse scope and type', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'movement-1',
        createdAt: new Date('2026-09-15T11:00:00.000Z'),
        movementType: 'PURCHASE',
        productName: 'Serum',
        sku: 'SRM-001',
        warehouseName: 'Kadıköy Depo',
        quantity: '3.50',
        unitCost: '200.00',
        movementValue: '700.00',
        referenceType: 'PURCHASE_ORDER',
      },
    ]);
    const input = {
      movementType: 'PURCHASE',
      from: new Date('2026-09-15T00:00:00.000Z'),
      to: new Date('2026-09-15T23:59:59.999Z'),
    };

    const rows = await service.movementDetails(input);

    expect(getWarehouseScope).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('m.type::text=$4::text'),
      'tenant-1',
      'company-1',
      ['branch-1'],
      'PURCHASE',
      input.from,
      input.to,
    );
    expect(rows).toEqual([
      {
        id: 'movement-1',
        createdAt: new Date('2026-09-15T11:00:00.000Z'),
        movementType: 'PURCHASE',
        productName: 'Serum',
        sku: 'SRM-001',
        warehouseName: 'Kadıköy Depo',
        quantity: 3.5,
        unitCost: 200,
        movementValue: 700,
        referenceType: 'PURCHASE_ORDER',
      },
    ]);
  });
});
