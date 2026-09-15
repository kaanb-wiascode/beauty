import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService organization scope', () => {
  const tenant = {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue(null),
  } as any;

  const inventoryScope = {
    getWarehouseScope: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchIds: ['branch-a', 'branch-b'],
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    tenant.getBranchId.mockReturnValue(null);
    inventoryScope.getWarehouseScope.mockResolvedValue({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchIds: ['branch-a', 'branch-b'],
    });
  });

  it('scopes movement reads to assigned branches when COMPANY has no active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new InventoryService(
      { $queryRawUnsafe: query } as any,
      tenant,
      inventoryScope,
    );

    await service.movements(50);

    expect(inventoryScope.getWarehouseScope).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain('w.branch_id=ANY($2::text[])');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'company-a',
      ['branch-a', 'branch-b'],
      50,
    ]);
  });

  it('uses assigned branches for product stock aggregation without SQL interpolation', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const prisma = {
      $executeRawUnsafe: execute,
      $queryRawUnsafe: query,
    } as any;
    const service = new InventoryService(prisma, tenant, inventoryScope);

    await service.products('serum');

    const productsCall = query.mock.calls[query.mock.calls.length - 1];
    expect(String(productsCall[0])).toContain('w.branch_id=ANY($3::text[])');
    expect(String(productsCall[0])).not.toContain("branch-a'::text");
    expect(productsCall.slice(1)).toEqual([
      'company-a',
      'serum',
      ['branch-a', 'branch-b'],
    ]);
  });

  it('blocks warehouse mutations outside assigned organization scope', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'product-a' }])
        .mockResolvedValueOnce([]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const service = new InventoryService(prisma, tenant, inventoryScope);

    await expect(
      service.addMovement('product-a', 'warehouse-outside', 1, 'ADJUSTMENT_IN'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(String(tx.$queryRawUnsafe.mock.calls[1][0])).toContain(
      'branch_id=ANY($3::text[])',
    );
    expect(tx.$queryRawUnsafe.mock.calls[1].slice(1)).toEqual([
      'warehouse-outside',
      'company-a',
      ['branch-a', 'branch-b'],
    ]);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('keeps CENTRAL company-wide reads represented by a null branch list', async () => {
    inventoryScope.getWarehouseScope.mockResolvedValue({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchIds: null,
    });
    const query = jest.fn().mockResolvedValue([]);
    const service = new InventoryService(
      { $queryRawUnsafe: query } as any,
      tenant,
      inventoryScope,
    );

    await service.purchaseOrders();

    expect(query.mock.calls[0].slice(1)).toEqual(['company-a', null]);
  });
});
