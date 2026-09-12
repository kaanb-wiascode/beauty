import { NotFoundException } from '@nestjs/common';
import { SupplierQuoteService } from './supplier-quote.service';
import type { SupplierPortalPrincipal } from './supplier-portal-auth.service';

const principal: SupplierPortalPrincipal = {
  tokenType: 'supplier_portal',
  sub: 'user-1',
  supplierOrganizationId: 'supplier-org-1',
  supplierMembershipId: 'membership-1',
  supplierRole: 'ADMIN',
};

describe('SupplierQuoteService', () => {
  it('scopes the RFQ invitation list to the authenticated supplier organization', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new SupplierQuoteService(prisma);

    await service.list(principal);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('rs.supplier_organization_id=$1::text');
    expect(sql).toContain("r.status<>'DRAFT'");
    expect(query.mock.calls[0].slice(1)).toEqual(['supplier-org-1']);
  });

  it('does not expose an RFQ when the supplier organization has no invitation', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const service = new SupplierQuoteService(prisma);

    await expect(service.get(principal, 'rfq-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(String(query.mock.calls[0][0])).toContain(
      'rs.supplier_organization_id=$2::text',
    );
    expect(query.mock.calls[0].slice(1)).toEqual(['rfq-x', 'supplier-org-1']);
  });

  it('requires the authenticated organization when locking a quote for submit', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: jest.fn(),
    };
    const transaction = jest.fn(async (callback) => callback(tx));
    const prisma = { $transaction: transaction } as never;
    const service = new SupplierQuoteService(prisma);

    await expect(service.submit(principal, 'rfq-x', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(String(query.mock.calls[0][0])).toContain(
      'sq.supplier_organization_id=$2::text',
    );
    expect(query.mock.calls[0].slice(1)).toEqual(['rfq-x', 'supplier-org-1']);
  });
});
