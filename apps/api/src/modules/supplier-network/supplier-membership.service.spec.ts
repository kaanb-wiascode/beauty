import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { SupplierMembershipService } from './supplier-membership.service';

describe('SupplierMembershipService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const service = new SupplierMembershipService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects listing memberships for an unknown or archived organization', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.listMemberships('supplier-org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(String(queryRawUnsafe.mock.calls[0]?.[0] ?? '')).toContain(
      "status<>'ARCHIVED'",
    );
  });

  it('lists memberships only for the requested supplier organization', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'supplier-org-1' }]);
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(service.listMemberships('supplier-org-1')).resolves.toEqual([]);

    expect(queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE sm.supplier_organization_id=$1'),
      'supplier-org-1',
    );
  });

  it('rejects membership assignment when the target user does not exist', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.upsertMembership(
        'supplier-org-1',
        { userId: 'user-1', role: 'ADMIN' },
        'platform-admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('writes membership and audit atomically in the same SQL statement', async () => {
    const membership = {
      id: 'membership-1',
      supplierOrganizationId: 'supplier-org-1',
      userId: 'user-1',
      role: 'ADMIN',
      status: 'ACTIVE',
    };

    queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'supplier-org-1' }])
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValueOnce([membership]);

    await expect(
      service.upsertMembership(
        'supplier-org-1',
        { userId: 'user-1', role: 'ADMIN' },
        'platform-admin-1',
      ),
    ).resolves.toEqual(membership);

    expect(queryRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('WITH membership AS'),
      'supplier-org-1',
      'user-1',
      'ADMIN',
      'platform-admin-1',
    );

    const sql = String(queryRawUnsafe.mock.calls[2]?.[0] ?? '');
    expect(sql).toContain('INSERT INTO supplier_memberships');
    expect(sql).toContain('INSERT INTO supplier_membership_audit_logs');
    expect(sql).toContain("'UPSERT'");
  });
});
