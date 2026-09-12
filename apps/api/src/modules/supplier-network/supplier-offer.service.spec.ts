import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupplierOfferService } from './supplier-offer.service';

const principal = {
  tokenType: 'supplier_portal' as const,
  sub: 'user-a',
  supplierOrganizationId: 'org-a',
  supplierMembershipId: 'membership-a',
  supplierRole: 'ADMIN' as const,
};

describe('SupplierOfferService', () => {
  function createService(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const prisma = { $queryRawUnsafe: query, $executeRawUnsafe: execute, $transaction: transaction } as never;
    return { service: new SupplierOfferService(prisma), transaction, execute };
  }

  it('scopes supplier offer list to the supplier organization in the portal principal', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);

    await service.list(principal);

    expect(String(query.mock.calls[0][0])).toContain('so.supplier_organization_id=$1::text');
    expect(query.mock.calls[0][1]).toBe('org-a');
  });

  it('projects only active catalog variants and joins only this supplier organization offer state', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);

    await service.listCatalogVariants(principal);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("cv.status='ACTIVE'");
    expect(sql).toContain("cp.status='ACTIVE'");
    expect(sql).toContain('so.supplier_organization_id=$1::text');
    expect(query.mock.calls[0][1]).toBe('org-a');
  });

  it('rejects activation when the supplier organization is not verified', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'offer-1', status: 'DRAFT', version: 1, verificationStatus: 'PENDING' }]);
    const { service, transaction } = createService(query);

    await expect(service.transition(principal, 'offer-1', 1, 'ACTIVE')).rejects.toBeInstanceOf(ForbiddenException);
    expect(String(query.mock.calls[0][0])).toContain('supplier_organization_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('FOR UPDATE OF so');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects stale commercial updates using the expected offer version', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'offer-1', status: 'ACTIVE', version: 3 }]);
    const { service } = createService(query);

    await expect(service.update(principal, 'offer-1', {
      expectedVersion: 2,
      unitPrice: 100,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments version and appends an audit event in the same transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'offer-1', status: 'INACTIVE', version: 2, verificationStatus: 'VERIFIED' }])
      .mockResolvedValueOnce([{ id: 'offer-1', status: 'ACTIVE', version: 3 }]);
    const execute = jest.fn().mockResolvedValue(1);
    const { service } = createService(query, execute);

    const result = await service.transition(principal, 'offer-1', 2, 'ACTIVE');

    expect(result).toMatchObject({ status: 'ACTIVE', version: 3 });
    expect(String(query.mock.calls[1][0])).toContain('version=$4');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toContain('supplier_offer_events');
    expect(execute.mock.calls[0]).toContain('ACTIVATED');
  });
});
