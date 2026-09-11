import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcurementReplacementsService } from './procurement-replacements.service';

describe('ProcurementReplacementsService', () => {
  function createService(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      chartOfAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'inventory-account', active: true })
          .mockResolvedValueOnce({ id: 'payable-account', active: true }),
        update: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 'journal-1' }) },
    };
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    return {
      service: new ProcurementReplacementsService(prisma, tenant),
      execute,
      tx,
    };
  }

  it('does not expose a purchase return outside the active company and branch scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);
    await expect(
      service.submit(
        'return-x',
        { reason: 'Hasarlı ürün değişimi', items: [{ purchaseReturnItemId: 'item-x', quantity: 1 }] },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(String(query.mock.calls[0][0])).toContain('pr.company_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('pr.branch_id=$3::text');
  });

  it('rejects cumulative replacement quantity above the returned quantity', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'return-1', goodsReceiptId: 'receipt-1', supplierBillId: 'bill-1', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{ id: 'return-item-1', purchaseOrderItemId: 'po-item-1', productId: 'product-1', quantity: 3, unitCost: 10, replacementQuantity: 2 }]);
    const { service } = createService(query);
    await expect(
      service.submit(
        'return-1',
        { reason: 'Replacement', items: [{ purchaseReturnItemId: 'return-item-1', quantity: 2 }] },
        'user-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('receives an approved replacement exactly once and restores inventory, PO receipt and AP accounting', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 'replacement-1', status: 'APPROVED', purchaseReturnId: 'return-1', goodsReceiptId: 'receipt-1',
        supplierBillId: 'bill-1', branchId: 'branch-a', purchaseOrderId: 'po-1', warehouseId: 'warehouse-1',
      }])
      .mockResolvedValueOnce([{
        id: 'replacement-item-1', purchaseReturnItemId: 'return-item-1', purchaseOrderItemId: 'po-item-1',
        productId: 'product-1', quantity: 2, unitCost: 25, receivedQuantity: 0,
      }])
      .mockResolvedValueOnce([{ id: 'bill-1', status: 'OPEN', amount: 50 }])
      .mockResolvedValueOnce([{ id: 'stock-1', quantity: 3, costPerUnit: 20 }])
      .mockResolvedValueOnce([{ count: 0 }]);
    const { service, execute, tx } = createService(query);

    const result = await service.receive('replacement-1', 'user-a', 'Tedarikçi tekrar teslim etti');

    expect(result).toMatchObject({
      replacementRequestId: 'replacement-1',
      purchaseReturnId: 'return-1',
      purchaseOrderId: 'po-1',
      supplierBillId: 'bill-1',
      receivedTotal: 50,
      status: 'RECEIVED',
    });
    expect(execute.mock.calls.some((call) => String(call[0]).includes('inventory_stock'))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes("reference_type,reference_id,note") && String(call[0]).includes("'PURCHASE_REPLACEMENT'"))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('received_quantity=received_quantity+$2'))).toBe(true);
    expect(execute.mock.calls.some((call) => String(call[0]).includes('supplier_bills SET amount=amount+$2'))).toBe(true);
    expect(tx.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        referenceType: 'PURCHASE_REPLACEMENT',
        lines: { create: [
          { accountId: 'inventory-account', debit: 50, credit: 0 },
          { accountId: 'payable-account', debit: 0, credit: 50 },
        ] },
      }),
    }));
  });
});
