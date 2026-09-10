import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService asset maintenance scope', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { queryRawUnsafe } as any;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as any;

  beforeEach(() => queryRawUnsafe.mockReset());

  it('rejects maintenance for an asset outside the active branch', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);
    const service = new InventoryService(prisma, tenantContext);

    await expect(
      service.createAssetMaintenance({ assetId: 'asset-other-branch', type: 'PREVENTIVE' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe.mock.calls[0][0]).toContain('AND (branch_id=$3::text OR branch_id IS NULL)');
    expect(queryRawUnsafe.mock.calls[0].slice(1)).toEqual([
      'asset-other-branch',
      'company-1',
      'branch-1',
    ]);
  });

  it('uses the scoped asset id when creating maintenance', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockResolvedValueOnce([{ id: 'maintenance-1', assetId: 'asset-1' }]);
    const service = new InventoryService(prisma, tenantContext);

    const result = await service.createAssetMaintenance({
      assetId: 'asset-1',
      type: 'PREVENTIVE',
      status: 'PLANNED',
    } as any);

    expect(result).toEqual({ id: 'maintenance-1', assetId: 'asset-1' });
    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(queryRawUnsafe.mock.calls[1][1]).toBe('asset-1');
  });
});
