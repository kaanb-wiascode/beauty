import { Prisma } from '@beauty-erp/database';
import { ProcurementRfqService } from './procurement-rfq.service';

describe('ProcurementRfqService', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
  }

  it('scopes RFQ list by tenant, company and active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new ProcurementRfqService(prisma, tenant());

    await service.list('PUBLISHED');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('r.tenant_id=$1::text');
    expect(sql).toContain('r.company_id=$2::text');
    expect(sql).toContain('w.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      'PUBLISHED',
    ]);
  });

  it('creates an awarded purchase order as DRAFT inside a serializable transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'rfq-1',
          status: 'CLOSED',
          warehouseId: 'warehouse-1',
          awardedQuoteId: null,
          purchaseOrderId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'quote-1',
          status: 'SUBMITTED',
          currency: 'TRY',
          validUntil: null,
          version: 2,
          supplierConnectionId: 'connection-1',
          inventorySupplierId: 'inventory-supplier-1',
          supplierOrganizationId: 'supplier-org-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          rfqItemId: 'rfq-item-1',
          inventoryProductId: 'product-1',
          quantity: 2,
          unitCost: 12.5,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'po-1', status: 'DRAFT', totalAmount: 25 },
      ])
      .mockResolvedValueOnce([]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const transaction = jest.fn(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return callback(tx);
    });
    const prisma = { $transaction: transaction } as never;
    const service = new ProcurementRfqService(prisma, tenant());

    const result = await service.award('rfq-1', 'quote-1', 'user-1');

    expect(result).toMatchObject({
      rfqId: 'rfq-1',
      quoteId: 'quote-1',
      purchaseOrderId: 'po-1',
      purchaseOrderStatus: 'DRAFT',
      status: 'AWARDED',
      idempotent: false,
    });
    const purchaseOrderInsert = query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO inventory_purchase_orders'),
    );
    expect(purchaseOrderInsert).toBeDefined();
    expect(String(purchaseOrderInsert?.[0])).toContain("'DRAFT'");
    expect(String(purchaseOrderInsert?.[0])).not.toContain("'APPROVED'");
  });

  it('returns the existing purchase order for the same already-awarded quote', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'rfq-1',
        status: 'AWARDED',
        warehouseId: 'warehouse-1',
        awardedQuoteId: 'quote-1',
        purchaseOrderId: 'po-1',
      },
    ]);
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn(),
    };
    const transaction = jest.fn(async (callback) => callback(tx));
    const prisma = { $transaction: transaction } as never;
    const service = new ProcurementRfqService(prisma, tenant());

    await expect(service.award('rfq-1', 'quote-1', 'user-1')).resolves.toEqual({
      rfqId: 'rfq-1',
      quoteId: 'quote-1',
      purchaseOrderId: 'po-1',
      status: 'AWARDED',
      idempotent: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
