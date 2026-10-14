import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService permission-scoped staff choices', () => {
  it('uses the caller branch scope and only returns name-only active staff', async () => {
    const staff = [{
      id: 'staff-1',
      firstName: 'Selin',
      lastName: 'Kaya',
      branchId: 'branch-1',
    }];
    const findMany = jest.fn((query: unknown) => {
      void query;
      return Promise.resolve(staff);
    });
    const prisma = { staff: { findMany } };
    const scope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      }),
    };
    const service = new AppointmentsService(
      prisma as unknown as PrismaService,
      {} as TenantContext,
      scope as unknown as OrganizationScopeService,
      {} as AccountingService,
      {} as CommerceFinanceSyncService,
    );

    const result = await service.findStaffOptions('Selin');
    expect(result).toEqual({ data: staff });

    const query = findMany.mock.calls[0]?.[0] as
      | {
          where: unknown;
          select: Record<string, boolean>;
          take: number;
          orderBy: unknown;
        }
      | undefined;
    expect(query?.where).toEqual({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
      OR: [
        { firstName: { contains: 'Selin', mode: 'insensitive' } },
        { lastName: { contains: 'Selin', mode: 'insensitive' } },
      ],
    });
    expect(query?.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      branchId: true,
    });
    expect(query?.take).toBe(30);
  });

  it('does not broaden empty branch membership to a tenant-wide directory', async () => {
    const findMany = jest.fn((query: unknown) => {
      void query;
      return Promise.resolve([]);
    });
    const prisma = { staff: { findMany } };
    const scope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: { in: [] },
      }),
    };
    const service = new AppointmentsService(
      prisma as unknown as PrismaService,
      {} as TenantContext,
      scope as unknown as OrganizationScopeService,
      {} as AccountingService,
      {} as CommerceFinanceSyncService,
    );

    const result = await service.findStaffOptions();
    expect(result.data).toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', branchId: { in: [] }, status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        branchId: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
        { id: 'asc' },
      ],
      take: 30,
    });
  });
});
