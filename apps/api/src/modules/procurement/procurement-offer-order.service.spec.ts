import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';
import { ProcurementOfferOrderService } from './procurement-offer-order.service';

describe('ProcurementOfferOrderService', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
  }

  function harness(
    query: jest.Mock,
    execute = jest.fn().mockResolvedValue(1),
  ) {
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return callback(tx);
    });
    const prisma = { $transaction: transaction } as never;
    return {
      service: new ProcurementOfferOrderService(prisma, tenant()),
      execute,
      transaction,
    };
  }

  const input = {
    warehouseId: 'warehouse-1',
    inventoryProductId: 'product-1',
    quantity: 4,
    expectedOfferVersion: 3,
    idempotencyKey: 'offer-order-request-1',
  };

  it('returns an existing order for the same tenant/company idempotency key', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { purchaseOrderId: 'po-existing', status: 'DRAFT', totalAmount: 100 },
    ]);
    const { service, execute } = harness(query);

    await expect(
      service.createDraftOrder('offer-1', input, 'user-1'),
    ).resolves.toEqual({
      purchaseOrderId: 'po-existing',
      purchaseOrderStatus: 'DRAFT',
      total: 100,
      idempotent: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toContain('o.tenant_id=$1::text');
    expect(String(query.mock.calls[0][0])).toContain('o.company_id=$2::text');
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces active branch warehouse scope before reading the offer', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { service } = harness(query);

    await expect(
      service.createDraftOrder('offer-1', input, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const warehouseSql = String(query.mock.calls[1][0]);
    expect(warehouseSql).toContain('tenant_id=$2::text');
    expect(warehouseSql).toContain('company_id=$3::text');
    expect(warehouseSql).toContain('branch_id=$4::text');
    expect(query.mock.calls[1].slice(1)).toEqual([
      'warehouse-1',
      'tenant-a',
      'company-a',
      'branch-a',
    ]);
  });

  it('rejects stale supplier offer versions under a row lock', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'warehouse-1' }])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          catalogVariantId: 'variant-1',
          currency: 'TRY',
          unitPrice: 25,
          minimumOrderQuantity: 1,
          orderMultiple: 1,
          availableQuantity: 10,
          validFrom: null,
          validTo: null,
          status: 'ACTIVE',
          version: 4,
          visibilityScope: 'CONNECTED',
          supplierOrganizationId: 'org-1',
          supplierConnectionId: 'connection-1',
          inventorySupplierId: 'supplier-1',
        },
      ]);
    const { service } = harness(query);

    await expect(
      service.createDraftOrder('offer-1', input, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(String(query.mock.calls[2][0])).toContain('FOR UPDATE OF so');
  });

  it('creates a DRAFT order and immutable source snapshot for a valid connected offer', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'warehouse-1' }])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          catalogVariantId: 'variant-1',
          currency: 'TRY',
          unitPrice: 25.125,
          minimumOrderQuantity: 2,
          orderMultiple: 2,
          availableQuantity: 20,
          validFrom: null,
          validTo: null,
          status: 'ACTIVE',
          version: 3,
          visibilityScope: 'CONNECTED',
          supplierOrganizationId: 'org-1',
          supplierConnectionId: 'connection-1',
          inventorySupplierId: 'supplier-1',
        },
      ])
      .mockResolvedValueOnce([{ id: 'product-1' }])
      .mockResolvedValueOnce([
        { id: 'po-1', status: 'DRAFT', totalAmount: 100.52 },
      ]);
    const execute = jest.fn().mockResolvedValue(1);
    const { service } = harness(query, execute);

    const result = await service.createDraftOrder('offer-1', input, 'user-1');

    expect(result).toEqual({
      purchaseOrderId: 'po-1',
      purchaseOrderStatus: 'DRAFT',
      total: 100.52,
      idempotent: false,
    });
    const offerSql = String(query.mock.calls[2][0]);
    expect(offerSql).toContain("org.verification_status='VERIFIED'");
    expect(offerSql).toContain("sc.status='ACTIVE'");
    expect(offerSql).toContain("so.visibility_scope='CONNECTED'");
    expect(offerSql).toContain('supplier_offer_eligibilities eligibility');
    expect(offerSql).toContain('eligibility.supplier_connection_id=sc.id');
    const productSql = String(query.mock.calls[3][0]);
    expect(productSql).toContain('l.catalog_variant_id=$4::text');
    const poInsert = String(query.mock.calls[4][0]);
    expect(poInsert).toContain("'DRAFT'");
    expect(poInsert).not.toContain("'APPROVED'");

    const originCall = execute.mock.calls.find((call) =>
      String(call[0]).includes('procurement_purchase_order_origins'),
    );
    expect(originCall).toBeDefined();
    expect(String(originCall?.[0])).toContain("'SUPPLIER_OFFER'");
    expect(originCall).toContain('offer-order-request-1');
    expect(String(originCall?.[10])).toContain('CONNECTED');
    expect(String(originCall?.[10])).toContain('connection-1');
  });

  it('returns not found when a restricted offer is not eligible for the buyer connection', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'warehouse-1' }])
      .mockResolvedValueOnce([]);
    const { service, execute } = harness(query);

    await expect(
      service.createDraftOrder('restricted-offer', input, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const offerSql = String(query.mock.calls[2][0]);
    expect(offerSql).toContain('eligibility.supplier_connection_id=sc.id');
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces MOQ, order multiple and available quantity before order creation', async () => {
    const baseOffer = {
      id: 'offer-1',
      catalogVariantId: 'variant-1',
      currency: 'TRY',
      unitPrice: 10,
      minimumOrderQuantity: 5,
      orderMultiple: 2,
      availableQuantity: 10,
      validFrom: null,
      validTo: null,
      status: 'ACTIVE',
      version: 3,
      visibilityScope: 'CONNECTED',
      supplierOrganizationId: 'org-1',
      supplierConnectionId: 'connection-1',
      inventorySupplierId: 'supplier-1',
    };

    for (const quantity of [4, 7, 12]) {
      const query = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'warehouse-1' }])
        .mockResolvedValueOnce([baseOffer]);
      const { service } = harness(query);
      await expect(
        service.createDraftOrder(
          'offer-1',
          { ...input, quantity, idempotencyKey: `key-${quantity}` },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).toHaveBeenCalledTimes(3);
    }
  });
});
