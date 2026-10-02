import { AccountsPayableService } from './accounts-payable.service';

describe('AccountsPayableService inventory purchase bill', () => {
  it('posts inventory asset against supplier payable without creating a finance expense mirror', async () => {
    const journalCreate = jest.fn().mockResolvedValue({ id: 'journal-1' });
    const tx: any = {
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        const text = String(sql);
        if (text.includes('pg_advisory_xact_lock')) return [{ locked: 1 }];
        if (text.includes('SELECT id FROM supplier_bills')) return [];
        if (text.includes('SELECT id FROM inventory_suppliers')) return [{ id: 'supplier-1' }];
        return [];
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      chartOfAccount: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.code === '150') return { id: 'account-150', active: true };
          if (where.code === '320') return { id: 'account-320', active: true };
          return null;
        }),
        update: jest.fn(),
        create: jest.fn(),
      },
      journalEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: journalCreate,
      },
    };

    const prisma: any = {};
    const tenantContext: any = {};
    const supplierExpenseSync = {
      syncBillCreated: jest.fn(),
      syncBillPayment: jest.fn(),
      syncBillCancelled: jest.fn(),
    };

    const service = new AccountsPayableService(
      prisma,
      tenantContext,
      supplierExpenseSync as any,
    );

    const result = await service.createInventoryPurchaseBillWithinTransaction(tx, {
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      purchaseOrderId: 'po-1',
      invoiceNumber: 'INV-1',
      description: 'Stok alımı',
      amount: 1250,
      dueAt: null,
      actorId: 'user-1',
    });

    expect(result).toEqual(expect.objectContaining({ idempotent: false }));
    expect(journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: 'SUPPLIER_BILL',
          lines: {
            create: [
              { accountId: 'account-150', debit: 1250, credit: 0 },
              { accountId: 'account-320', debit: 0, credit: 1250 },
            ],
          },
        }),
      }),
    );
    expect(supplierExpenseSync.syncBillCreated).not.toHaveBeenCalled();
  });
});
