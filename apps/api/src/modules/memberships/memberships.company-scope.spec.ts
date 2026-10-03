import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { MembershipsService } from './memberships.service';

describe('MembershipsService company isolation', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    membership: {
      findMany,
      findFirst,
    },
  } as unknown as PrismaService;
  const audit = {} as PlatformAuditService;

  function createService() {
    const context = new TenantContext();
    context.setContext({
      tenantId: 'tenant-1',
      membershipId: 'membership-admin',
      companyId: 'company-1',
      branchId: null,
      roleScope: 'CENTRAL',
    });
    return new MembershipsService(prisma, context, audit);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists memberships only from the active company context', async () => {
    findMany.mockResolvedValue([]);

    await createService().findAll();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          companyId: 'company-1',
        },
      }),
    );
  });

  it('denies direct-id effective permission probing outside the active company', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      createService().findEffectivePermissions('membership-company-2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'membership-company-2',
          tenantId: 'tenant-1',
          companyId: 'company-1',
        },
      }),
    );
  });
});
