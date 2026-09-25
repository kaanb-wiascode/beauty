import { ProcurementApprovalsService } from './procurement-approvals.service';

describe('ProcurementApprovalsService', () => {
  function createService(query: jest.Mock, execute = jest.fn().mockResolvedValue(1)) {
    const tx = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    };
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never;
    const tenant = {
      getTenantId: jest.fn().mockReturnValue('tenant-a'),
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    return {
      service: new ProcurementApprovalsService(prisma, tenant),
      execute,
    };
  }

  it('scopes approval-state reads through the purchase order warehouse branch', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'po-1' }])
      .mockResolvedValueOnce([{ id: 'po-1', status: 'PENDING', totalAmount: 1000 }])
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          level: 1,
          requiredRole: 'MANAGER',
          status: 'PENDING',
          approvedByUserId: null,
          approvedAt: null,
        },
      ]);
    const { service } = createService(query);

    const result = await service.getState('po-1');

    expect(result.order).toMatchObject({ id: 'po-1', status: 'PENDING' });
    const scopeSql = String(query.mock.calls[0][0]);
    expect(scopeSql).toContain('JOIN inventory_warehouses w');
    expect(scopeSql).toContain('w.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['po-1', 'company-a', 'branch-a']);
  });

  it('derives the approval branch from warehouse instead of a nonexistent purchase-order branch column', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'po-1', status: 'PENDING', branchId: 'branch-a' }])
      .mockResolvedValueOnce([
        { id: 'approval-1', level: 1, requiredRole: 'MANAGER', status: 'PENDING' },
      ])
      .mockResolvedValueOnce([
        {
          membershipId: 'membership-1',
          roleSlug: 'owner',
          roleName: 'Owner',
          roleScope: 'CENTRAL',
          hasBranchAccess: false,
        },
      ])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ id: 'po-1', status: 'APPROVED', totalAmount: 1000 }])
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          level: 1,
          requiredRole: 'MANAGER',
          status: 'APPROVED',
          approvedByUserId: 'user-a',
          approvedAt: new Date(),
        },
      ]);
    const { service } = createService(query);

    await service.approve('po-1', 1, 'user-a');

    const orderSql = String(query.mock.calls[0][0]);
    expect(orderSql).toContain('w.branch_id AS "branchId"');
    expect(orderSql).toContain('w.branch_id=$3::text');
    expect(orderSql).not.toContain('po.branch_id');
    expect(query.mock.calls[0].slice(1)).toEqual(['po-1', 'company-a', 'branch-a']);
  });
});
