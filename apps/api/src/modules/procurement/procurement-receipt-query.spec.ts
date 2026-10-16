import { NotFoundException } from '@nestjs/common';
import { ProcurementReceiptQueryService } from './procurement-receipt-query.service';

describe('ProcurementReceiptQueryService', () => {
  function createService(query: jest.Mock, branchId: string | null = 'branch-a') {
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
    return new ProcurementReceiptQueryService(prisma, tenant);
  }

  it('scopes receipt detail by tenant, company and active branch', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const service = createService(query);

    await expect(service.getReceiptDetail('receipt-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[0][0])).toContain('gr.tenant_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('gr.company_id=$3::text');
    expect(String(query.mock.calls[0][0])).toContain('gr.branch_id=$4::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['receipt-x', 'tenant-a', 'company-a', 'branch-a']);
  });

  it('returns item-level returnable quantities from posted purchase returns', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'receipt-1', branchId: 'branch-a', supplierName: 'Supplier' }])
      .mockResolvedValueOnce([{ id: 'item-1', quantity: 5, returnedQuantity: 2, returnableQuantity: 3 }]);
    const service = createService(query);

    const result = await service.getReceiptDetail('receipt-1');

    expect(result.items[0]).toMatchObject({ id: 'item-1', returnableQuantity: 3 });
    expect(String(query.mock.calls[1][0])).toContain('inventory_purchase_return_items');
    expect(String(query.mock.calls[1][0])).toContain('"returnableQuantity"');
  });
});
