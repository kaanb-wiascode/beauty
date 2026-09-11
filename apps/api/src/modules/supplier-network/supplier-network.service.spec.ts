import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { SupplierNetworkService } from './supplier-network.service';

describe('SupplierNetworkService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
  const service = new SupplierNetworkService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects incomplete supplier organization data before querying the database', async () => {
    await expect(
      service.createOrganization({
        slug: '***',
        legalName: '  ',
        displayName: 'VALOO Supplier',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects duplicate organizations before insert', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'supplier-org-1' }]);

    await expect(
      service.createOrganization({
        slug: ' Example Supplier ',
        legalName: ' Example Supplier A.Ş. ',
        displayName: ' Example ',
        taxCountry: ' tr ',
        taxNumber: ' 1234567890 ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM supplier_organizations'),
      'example-supplier',
      'TR',
      '1234567890',
    );
  });

  it('enforces tenant and company scope when connecting an inventory supplier', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.connectInventorySupplier({
        supplierOrganizationId: 'supplier-org-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        inventorySupplierId: 'inventory-supplier-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'WHERE id=$1 AND tenant_id=$2 AND company_id=$3',
      ),
      'inventory-supplier-1',
      'tenant-1',
      'company-1',
    );
  });

  it('persists the same tenant and company scope on a valid supplier connection', async () => {
    const connection = {
      id: 'connection-1',
      supplierOrganizationId: 'supplier-org-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      inventorySupplierId: 'inventory-supplier-1',
      status: 'ACTIVE',
    };

    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([
        {
          id: 'inventory-supplier-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          status: 'ACTIVE',
        },
      ])
      .mockResolvedValueOnce([connection]);

    await expect(
      service.connectInventorySupplier({
        supplierOrganizationId: 'supplier-org-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        inventorySupplierId: 'inventory-supplier-1',
      }),
    ).resolves.toEqual(connection);

    expect(queryRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO supplier_connections'),
      'supplier-org-1',
      'tenant-1',
      'company-1',
      'inventory-supplier-1',
    );
  });
});
