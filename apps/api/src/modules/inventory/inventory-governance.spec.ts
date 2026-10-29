import { BadRequestException } from '@nestjs/common';
import { InventoryGovernanceService } from './inventory-governance.service';

function tenant() {
  return {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue(null),
  } as never;
}

describe('InventoryGovernanceService', () => {
  it('rejects dispatch when transfer is not approved', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{
        id: 'transfer-a', status: 'PENDING', sourceWarehouseId: 'source-a', destinationWarehouseId: 'dest-a',
        sourceBranchId: null, destinationBranchId: null,
      }]),
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as never;
    const service = new InventoryGovernanceService(prisma, tenant());
    await expect(service.dispatchTransfer('transfer-a', 'user-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('limits approval lookups to the source branch, never the destination', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const execute = jest.fn();
    const scopedTenant = tenant() as any;
    scopedTenant.getBranchId.mockReturnValue('branch-a');
    const service = new InventoryGovernanceService(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as any,
      scopedTenant,
    );

    await expect(service.approveTransfer('transfer-a', 'user-a')).rejects.toThrow('Transfer kaydı bulunamadı.');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('sw.branch_id=$4::text');
    expect(sql).not.toContain('dw.branch_id=$4::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['transfer-a', 'tenant-a', 'company-a', 'branch-a']);
    expect(execute).not.toHaveBeenCalled();
  });

  it('limits dispatch lookups to source branch before any stock mutation', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const execute = jest.fn();
    const scopedTenant = tenant() as any;
    scopedTenant.getBranchId.mockReturnValue('branch-a');
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const service = new InventoryGovernanceService(
      { $transaction: jest.fn((fn: any) => fn(tx)) } as any,
      scopedTenant,
    );
    await expect(service.dispatchTransfer('transfer-a', 'user-a')).rejects.toThrow('Transfer kaydı bulunamadı.');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('sw.branch_id=$4::text');
    expect(sql).not.toContain('dw.branch_id=$4::text');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects cycle count posting when stock changed after snapshot', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: 'count-a', status: 'APPROVED', warehouseId: 'warehouse-a', branchId: null, reason: 'Sayım' }])
        .mockResolvedValueOnce([{ id: 'item-a', productId: 'product-a', expectedQuantity: '10', countedQuantity: '9', varianceQuantity: '-1', unitCost: '20', varianceValue: '20' }])
        .mockResolvedValueOnce([{ quantity: '11' }]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as never;
    const service = new InventoryGovernanceService(prisma, tenant());
    await expect(service.postCycleCount('count-a', 'user-a')).rejects.toThrow('Yeniden sayım yapmanız gerekiyor');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('lists cycle counts in exact tenant/company scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new InventoryGovernanceService(prisma, tenant());
    await service.listCycleCounts('SUBMITTED');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('cc.tenant_id=$1::text');
    expect(sql).toContain('cc.company_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a', null, 'SUBMITTED']);
  });
});
