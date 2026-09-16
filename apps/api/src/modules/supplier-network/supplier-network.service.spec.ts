import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { SupplierNetworkService } from './supplier-network.service';

describe('SupplierNetworkService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn(),
    getCompanyId: jest.fn(),
  } as unknown as TenantContext;

  const service = new SupplierNetworkService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(tenantContext.getTenantId).mockReturnValue('tenant-1');
    jest.mocked(tenantContext.getCompanyId).mockReturnValue('company-1');
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

  it('lists only active connections in the current tenant and company scope', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.listConnections()).resolves.toEqual([]);

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('WHERE sc.tenant_id=$1'),
      'tenant-1',
      'company-1',
    );

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("sc.company_id=$2");
    expect(sql).toContain("sc.status='ACTIVE'");
    expect(sql).not.toContain('tax_number');
    expect(sql).not.toContain('legal_name');
  });

  it('lists audit records only inside the current tenant and company scope', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.listAudit(500)).resolves.toEqual([]);

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM supplier_network_audit_logs'),
      'tenant-1',
      'company-1',
      200,
    );
    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('WHERE tenant_id=$1 AND company_id=$2');
    expect(sql).not.toContain('tax_number');
    expect(sql).not.toContain('legal_name');
  });

  it('enforces tenant and company context when connecting an inventory supplier', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1', status: 'ACTIVE' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.connectInventorySupplier(
        {
          supplierOrganizationId: 'supplier-org-1',
          inventorySupplierId: 'inventory-supplier-1',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tenantContext.getTenantId).toHaveBeenCalledTimes(1);
    expect(tenantContext.getCompanyId).toHaveBeenCalledTimes(1);
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

  it('persists connection and append-only audit atomically in one scoped SQL statement', async () => {
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
      service.connectInventorySupplier(
        {
          supplierOrganizationId: 'supplier-org-1',
          inventorySupplierId: 'inventory-supplier-1',
        },
        'user-1',
      ),
    ).resolves.toEqual(connection);

    expect(queryRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('WITH connection AS'),
      'supplier-org-1',
      'tenant-1',
      'company-1',
      'inventory-supplier-1',
      expect.any(String),
      'user-1',
    );

    const sql = String(queryRawUnsafe.mock.calls[2]?.[0] ?? '');
    expect(sql).toContain('INSERT INTO supplier_connections');
    expect(sql).toContain('INSERT INTO supplier_network_audit_logs');
    expect(sql).toContain("'SUPPLIER_CONNECTION_UPSERT'");
    expect(sql).not.toContain('tax_number');
    expect(sql).not.toContain('legal_name');
  });
});
