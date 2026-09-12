import { BadRequestException } from '@nestjs/common';
import { ProcurementReturnRequestsService } from './procurement-return-requests.service';

describe('ProcurementReturnRequestsService', () => {
  function createService(query: jest.Mock) {
    const tx = { $queryRawUnsafe: query };
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const returns = { partialReturn: jest.fn() } as never;
    return { service: new ProcurementReturnRequestsService(prisma, tenant, returns), prisma };
  }

  it('rejects a return request that exceeds unreserved returnable quantity', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'receipt-1', branchId: 'branch-a', reversedAt: null }])
      .mockResolvedValueOnce([{ id: 'item-1', quantity: 5, returnedQuantity: 1, reservedQuantity: 3 }]);
    const { service, prisma } = createService(query);

    await expect(
      service.submit(
        'receipt-1',
        { reason: 'Hasarlı ürün', items: [{ goodsReceiptItemId: 'item-1', quantity: 2 }] },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(String(query.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(String(query.mock.calls[1][0])).toContain("rr.status IN ('PENDING','APPROVED')");
    expect(String(query.mock.calls[1][0])).toContain('jsonb_array_elements(rr.items)');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a return request when quantity remains after posted and reserved returns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'receipt-1', branchId: 'branch-a', reversedAt: null }])
      .mockResolvedValueOnce([{ id: 'item-1', quantity: 5, returnedQuantity: 1, reservedQuantity: 1 }])
      .mockResolvedValueOnce([{ id: 'request-1', status: 'PENDING', goodsReceiptId: 'receipt-1' }]);
    const { service, prisma } = createService(query);

    const result = await service.submit(
      'receipt-1',
      { reason: 'Kalite problemi', items: [{ goodsReceiptItemId: 'item-1', quantity: 2 }] },
      'user-a',
    );

    expect(result).toMatchObject({ id: 'request-1', status: 'PENDING' });
    expect(String(query.mock.calls[2][0])).toContain('INSERT INTO inventory_purchase_return_requests');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
