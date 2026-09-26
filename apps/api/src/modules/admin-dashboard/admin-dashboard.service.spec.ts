import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('aggregates administration health signals for the active company', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ active: 8, suspended: 2 }])
      .mockResolvedValueOnce([{ pending: 3 }])
      .mockResolvedValueOnce([{ total: 6 }])
      .mockResolvedValueOnce([{ active: 4, inactive: 1 }])
      .mockResolvedValueOnce([{ active: 2, expiringSoon: 1 }])
      .mockResolvedValueOnce([{ enrolled: 6, eligible: 8 }])
      .mockResolvedValueOnce([{ withoutBranchScope: 1, broadCentral: 2 }])
      .mockResolvedValueOnce([{ total: 3, unhealthy: 1 }])
      .mockResolvedValueOnce([{ id: 'audit-1', resource: 'roles', action: 'update', actorUserId: 'user-1', targetEntityType: 'role', targetEntityId: 'role-1', createdAt: new Date() }]);

    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const tenantContext = {
      getContext: () => ({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: null,
        membershipId: 'membership-1',
        roleScope: 'CENTRAL',
      }),
    } as unknown as TenantContext;

    const result = await new AdminDashboardService(prisma, tenantContext).overview();

    expect(result.users).toEqual({
      active: 8,
      suspended: 2,
      withoutBranchScope: 1,
      broadCentral: 2,
    });
    expect(result.invitations.pending).toBe(3);
    expect(result.mfa.coveragePercent).toBe(75);
    expect(result.integrations.unhealthy).toBe(1);
    expect(result.temporaryAccess.expiringSoon).toBe(1);
    expect(result.recentAudit).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalledTimes(9);
  });
});
