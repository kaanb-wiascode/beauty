import { NotFoundException } from '@nestjs/common';
import { ProcurementOrdersQueryService } from './procurement-orders-query.service';

describe('ProcurementOrdersQueryService', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue(branchId),
    } as never;
  }

  it('lists purchase orders only from the active warehouse branch and exposes origin labels', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new ProcurementOrdersQueryService(prisma, tenant());

    await service.list();

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('JOIN inventory_warehouses w');
    expect(sql).toContain('w.branch_id=$2::text');
    expect(sql).toContain('procurement_purchase_order_origins o');
    expect(sql).toContain('o.source_type AS "originType"');
    expect(sql).toContain('org.display_name AS "supplierOrganizationName"');
    expect(query.mock.calls[0].slice(1)).toEqual(['company-a', 'branch-a']);
  });

  it('returns the immutable commercial origin only inside tenant company branch scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        purchaseOrderId: 'po-1',
        purchaseOrderStatus: 'DRAFT',
        purchaseOrderTotal: 125,
        warehouseName: 'Branch Depot',
        originId: 'origin-1',
        sourceType: 'SUPPLIER_OFFER',
        supplierOrganizationId: 'org-1',
        supplierOrganizationName: 'Supplier A',
        supplierConnectionId: 'connection-1',
        supplierOfferId: 'offer-1',
        supplierQuoteId: null,
        sourceVersion: 4,
        currency: 'TRY',
        idempotencyKey: 'key-1',
        commercialSnapshot: { sourceUnitPrice: 25.1234 },
        createdByUserId: 'user-1',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
      },
    ]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new ProcurementOrdersQueryService(prisma, tenant());

    const result = await service.getOrigin('po-1');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('po.tenant_id=$2::text');
    expect(sql).toContain('po.company_id=$3::text');
    expect(sql).toContain('w.branch_id=$4::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'po-1',
      'tenant-a',
      'company-a',
      'branch-a',
    ]);
    expect(result.origin).toMatchObject({
      sourceType: 'SUPPLIER_OFFER',
      supplierOfferId: 'offer-1',
      sourceVersion: 4,
      commercialSnapshot: { sourceUnitPrice: 25.1234 },
    });
  });

  it('returns null origin for legacy purchase orders while preserving scoped order visibility', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        purchaseOrderId: 'po-legacy',
        purchaseOrderStatus: 'ORDERED',
        purchaseOrderTotal: 50,
        warehouseName: 'Branch Depot',
        originId: null,
      },
    ]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new ProcurementOrdersQueryService(prisma, tenant());

    await expect(service.getOrigin('po-legacy')).resolves.toMatchObject({
      purchaseOrderId: 'po-legacy',
      origin: null,
    });
  });

  it('rejects purchase order origin reads outside active scope', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new ProcurementOrdersQueryService(prisma, tenant());

    await expect(service.getOrigin('po-other')).rejects.toBeInstanceOf(NotFoundException);
  });
});
