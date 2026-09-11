import { BadRequestException } from '@nestjs/common';
import { WarehouseAccountingService } from './warehouse-accounting.service';

describe('WarehouseAccountingService', () => {
  const tenant = {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue('branch-a'),
  } as never;

  it('scopes warehouse valuation by tenant company and branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new WarehouseAccountingService({ $queryRawUnsafe: query } as never, tenant);
    await service.valuation();
    expect(String(query.mock.calls[0][0])).toContain('w.tenant_id=$1::text');
    expect(String(query.mock.calls[0][0])).toContain('w.company_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('w.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a']);
  });

  it('reports warehouse subledger against the 150 control account', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ value: '1000.00' }])
      .mockResolvedValueOnce([{ value: '990.00' }]);
    const service = new WarehouseAccountingService({ $queryRawUnsafe: query } as never, tenant);
    await expect(service.reconciliation()).resolves.toMatchObject({
      subledgerValue: 1000,
      glBalance: 990,
      variance: 10,
      reconciled: false,
      scope: 'BRANCH',
    });
    expect(String(query.mock.calls[1][0])).toContain("coa.code='150'");
    expect(String(query.mock.calls[1][0])).toContain('je."branchId"=$3::text');
  });

  it('rejects an already received transfer before moving stock', async () => {
    const query = jest.fn().mockResolvedValue([{
      id: 'transfer-a',
      status: 'RECEIVED',
      sourceWarehouseId: 'source-a',
      destinationWarehouseId: 'destination-a',
    }]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) } as never;
    const service = new WarehouseAccountingService(prisma, tenant);
    await expect(service.receiveTransfer('transfer-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires an adjustment reason and at least one line', async () => {
    const service = new WarehouseAccountingService({} as never, tenant);
    await expect(service.postAdjustment({
      warehouseId: 'warehouse-a',
      type: 'DAMAGE',
      reason: '   ',
      items: [{ productId: 'product-a', quantity: 1 }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
