import { BadRequestException } from '@nestjs/common';
import { InventoryTransferReceiptService } from './inventory-transfer-receipt.service';

function tenant() {
  return {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
    getBranchId: jest.fn().mockReturnValue(null),
  } as never;
}

describe('InventoryTransferReceiptService', () => {
  it('only receives transfers that are in transit', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ id: 'transfer-a', status: 'APPROVED', destinationWarehouseId: 'warehouse-b' }]),
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as never;
    const service = new InventoryTransferReceiptService(prisma, tenant());
    await expect(service.receive('transfer-a', 'user-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
