import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ApprovalWorkflowService } from './approval-workflow.service';

describe('Approval authorization preflight', () => {
  const query = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ $queryRawUnsafe: query }));
  const service = new ApprovalWorkflowService(
    { $transaction: transaction } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
  );
  beforeEach(() => {
    query.mockReset();
    transaction.mockClear();
  });

  it('returns false for a missing or non-pending scoped approval', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.canAct('approval-1', { userId: 'user-1', roleId: 'role-1' })).resolves.toBe(false);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status='PENDING'"),
      'approval-1', 'tenant-1', 'company-1',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('denies when there is no matching policy step', async () => {
    query.mockResolvedValueOnce([{ id: 'approval-1', policy_id: 'policy-1', current_step: 1 }])
      .mockResolvedValueOnce([]);
    await expect(service.canAct('approval-1', { userId: 'user-1', roleId: 'role-1' })).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
