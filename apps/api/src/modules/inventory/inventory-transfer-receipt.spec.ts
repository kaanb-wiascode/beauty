import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryTransferReceiptService } from './inventory-transfer-receipt.service';

function tenant() {
  return {
    getTenantId: jest.fn().mockReturnValue('tenant-a'),
    getCompanyId: jest.fn().mockReturnValue('company-a'),
  } as never;
}

function inventoryScope(branchIds: string[] | null = null) {
  return {
    getWarehouseScope: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchIds,
    }),
  } as never;
}

describe('InventoryTransferReceiptService', () => {
  it('only receives transfers that are in transit', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          id: 'transfer-a',
          status: 'APPROVED',
          destinationWarehouseId: 'warehouse-b',
        },
      ]),
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as never;
    const service = new InventoryTransferReceiptService(
      prisma,
      tenant(),
      inventoryScope(),
    );

    await expect(service.receive('transfer-a', 'user-a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('passes assigned branch ids as a parameterized warehouse scope', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]),
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as never;
    const scope = inventoryScope(['branch-a', 'branch-b']);
    const service = new InventoryTransferReceiptService(prisma, tenant(), scope);

    await expect(service.receive('foreign-transfer', 'user-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ANY($4::text[])'),
      'foreign-transfer',
      'tenant-a',
      'company-a',
      ['branch-a', 'branch-b'],
    );
  });
});
