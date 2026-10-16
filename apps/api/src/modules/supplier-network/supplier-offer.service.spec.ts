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
  function createService(
    query: jest.Mock,
    execute = jest.fn().mockResolvedValue(1),
  ) {
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: transaction,
    } as never;
    return { service: new SupplierOfferService(prisma), transaction, execute };
  }

  it('scopes supplier offer list to the supplier organization in the portal principal', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);

    await service.list(principal);

    expect(String(query.mock.calls[0][0])).toContain(
      'so.supplier_organization_id=$1::text',
    );
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

  it('lists only active buyer connections for restricted-offer targeting', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    const { service } = createService(query);

    await service.listEligibilityOptions(principal);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('sc.supplier_organization_id=$1::text');
    expect(sql).toContain("sc.status='ACTIVE'");
    expect(sql).toContain('JOIN companies c');
    expect(query.mock.calls[0][1]).toBe('org-a');
  });

  it('rejects a restricted offer without an eligible buyer connection', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'variant-a' }])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);

    await expect(
      service.create(principal, {
        catalogVariantId: 'variant-a',
        unitPrice: 100,
        visibilityScope: 'RESTRICTED',
        eligibleConnectionIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects a restricted target that is not an active connection of this supplier organization', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'variant-a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { service } = createService(query);

    await expect(
      service.create(principal, {
        catalogVariantId: 'variant-a',
        unitPrice: 100,
        visibilityScope: 'RESTRICTED',
        eligibleConnectionIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(String(query.mock.calls[2][0])).toContain(
      'supplier_organization_id=$1::text',
    );
    expect(String(query.mock.calls[2][0])).toContain("status='ACTIVE'");
  });

  it('persists restricted targets and snapshots visibility in the create audit event', async () => {
    const connectionId = '11111111-1111-4111-8111-111111111111';
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'variant-a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: connectionId }])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          status: 'DRAFT',
          version: 1,
          visibilityScope: 'RESTRICTED',
        },
      ]);
    const execute = jest.fn().mockResolvedValue(1);
    const { service } = createService(query, execute);

    await service.create(principal, {
      catalogVariantId: 'variant-a',
      unitPrice: 100,
      visibilityScope: 'RESTRICTED',
      eligibleConnectionIds: [connectionId],
    });

    const eligibilityInsert = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO supplier_offer_eligibilities'),
    );
    expect(eligibilityInsert).toBeDefined();
    expect(eligibilityInsert).toContain(connectionId);
    const eventCall = execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO supplier_offer_events'),
    );
    expect(eventCall).toBeDefined();
    expect(String(eventCall?.[4])).toContain('RESTRICTED');
    expect(String(eventCall?.[4])).toContain(connectionId);
  });

  it('rejects activation when the supplier organization is not verified', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'offer-1',
        status: 'DRAFT',
        version: 1,
        verificationStatus: 'PENDING',
      },
    ]);
    const { service, transaction } = createService(query);

    await expect(
      service.transition(principal, 'offer-1', 1, 'ACTIVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(String(query.mock.calls[0][0])).toContain(
      'supplier_organization_id=$2::text',
    );
    expect(String(query.mock.calls[0][0])).toContain('FOR UPDATE OF so');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects activation of a restricted offer whose eligible connections are no longer active', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'offer-1',
        status: 'DRAFT',
        version: 1,
        verificationStatus: 'VERIFIED',
        visibilityScope: 'RESTRICTED',
        eligibleConnectionCount: 0,
      },
    ]);
    const { service } = createService(query);

    await expect(
      service.transition(principal, 'offer-1', 1, 'ACTIVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects stale commercial updates using the expected offer version', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { id: 'offer-1', status: 'ACTIVE', version: 3 },
    ]);
    const { service } = createService(query);

    await expect(
      service.update(principal, 'offer-1', {
        expectedVersion: 2,
        unitPrice: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments version and appends an audit event in the same transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          status: 'INACTIVE',
          version: 2,
          verificationStatus: 'VERIFIED',
          visibilityScope: 'CONNECTED',
          eligibleConnectionCount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          status: 'ACTIVE',
          version: 3,
          visibilityScope: 'CONNECTED',
        },
      ]);
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
