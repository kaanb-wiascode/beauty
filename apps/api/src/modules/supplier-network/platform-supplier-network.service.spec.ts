import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { PlatformSupplierNetworkService } from './platform-supplier-network.service';

describe('PlatformSupplierNetworkService mutations', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const service = new PlatformSupplierNetworkService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates supplier organization and platform audit atomically without storing tax value in audit metadata', async () => {
    const organization = {
      id: 'supplier-org-1',
      slug: 'supplier-one',
      legalName: 'Supplier One A.S.',
      displayName: 'Supplier One',
      organizationType: 'DISTRIBUTOR',
      status: 'ACTIVE',
      verificationStatus: 'UNVERIFIED',
    };
    queryRawUnsafe.mockResolvedValueOnce([organization]);

    await expect(
      service.createOrganization(
        {
          slug: 'supplier-one',
          legalName: 'Supplier One A.S.',
          displayName: 'Supplier One',
          organizationType: 'DISTRIBUTOR',
          status: 'ACTIVE',
          taxCountry: 'TR',
          taxNumber: '1234567890',
        },
        'platform-admin-1',
      ),
    ).resolves.toEqual(organization);

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('WITH organization AS');
    expect(sql).toContain('INSERT INTO supplier_organizations');
    expect(sql).toContain('INSERT INTO supplier_platform_audit_logs');
    expect(sql).toContain("'hasTaxIdentity'");
    expect(sql).not.toContain("'taxNumber',tax_number");
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'supplier-one',
      'Supplier One A.S.',
      'Supplier One',
      'DISTRIBUTOR',
      'ACTIVE',
      null,
      null,
      null,
      'TR',
      '1234567890',
      'platform-admin-1',
    );
  });

  it('updates only payload-selected fields and writes audit in the same statement', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'supplier-org-1',
        displayName: 'Supplier One Updated',
        status: 'SUSPENDED',
      },
    ]);

    await service.updateOrganization(
      'supplier-org-1',
      { displayName: 'Supplier One Updated', status: 'SUSPENDED' },
      'platform-admin-1',
    );

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("$2::jsonb ? 'displayName'");
    expect(sql).toContain("$2::jsonb ? 'status'");
    expect(sql).toContain('INSERT INTO supplier_platform_audit_logs');
    expect(queryRawUnsafe.mock.calls[0]?.[1]).toBe('supplier-org-1');
    expect(JSON.parse(String(queryRawUnsafe.mock.calls[0]?.[2]))).toEqual({
      displayName: 'Supplier One Updated',
      status: 'SUSPENDED',
    });
    expect(queryRawUnsafe.mock.calls[0]?.[3]).toBe('platform-admin-1');
  });

  it('rejects updates for unknown organizations', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      service.updateOrganization(
        'missing-org',
        { displayName: 'Missing' },
        'platform-admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps unique identity conflicts to a conflict response', async () => {
    queryRawUnsafe.mockRejectedValueOnce({ code: '23505' });

    await expect(
      service.createOrganization(
        {
          slug: 'duplicate',
          legalName: 'Duplicate',
          displayName: 'Duplicate',
          organizationType: 'OTHER',
          status: 'ACTIVE',
        },
        'platform-admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
