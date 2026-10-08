import { BadRequestException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { QualityAssigneeScopeGuard } from './quality-assignee-scope.guard';

describe('QualityAssigneeScopeGuard', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as unknown as PrismaService;
  const guard = new QualityAssigneeScopeGuard(prisma);

  const context = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows requests without an assignee mutation', async () => {
    await expect(
      guard.canActivate(context({ body: {}, user: { tenantId: 't1', companyId: 'c1' } })),
    ).resolves.toBe(true);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('requires the assignee membership to belong to the active company', async () => {
    queryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      guard.canActivate(
        context({
          body: { assignedUserId: 'u2', branchId: 'b1' },
          user: { tenantId: 't1', companyId: 'c1', branchId: null },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const sql = String(queryRawUnsafe.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('m."companyId"=$3::text');
    expect(sql).toContain("r.scope='CENTRAL'");
    expect(sql).toContain('membership_branch_access');
    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'u2',
      't1',
      'c1',
      'b1',
    );
  });

  it('rejects assigning across the active branch context', async () => {
    await expect(
      guard.canActivate(
        context({
          body: { assignedUserId: 'u2', branchId: 'b2' },
          user: { tenantId: 't1', companyId: 'c1', branchId: 'b1' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('resolves the case branch before validating reassignment', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ branchId: 'b1' }])
      .mockResolvedValueOnce([{ id: 'membership-1' }]);

    await expect(
      guard.canActivate(
        context({
          body: { assignedUserId: 'u2' },
          params: { id: 'case-1' },
          route: { path: 'cases/:id/assign' },
          user: { tenantId: 't1', companyId: 'c1', branchId: null },
        }),
      ),
    ).resolves.toBe(true);

    expect(String(queryRawUnsafe.mock.calls[0]?.[0] ?? '')).toContain('FROM quality_cases');
    expect(queryRawUnsafe.mock.calls[1]?.slice(1)).toEqual(['u2', 't1', 'c1', 'b1']);
  });

  it('resolves the feedback branch before validating escalation assignee', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ branchId: 'b1' }])
      .mockResolvedValueOnce([{ id: 'membership-1' }]);

    await expect(
      guard.canActivate(
        context({
          body: { assignedUserId: 'u2' },
          params: { id: 'feedback-1' },
          route: { path: 'feedback/:id/escalate' },
          user: { tenantId: 't1', companyId: 'c1', branchId: null },
        }),
      ),
    ).resolves.toBe(true);

    expect(String(queryRawUnsafe.mock.calls[0]?.[0] ?? '')).toContain('FROM customer_feedback');
  });
});
