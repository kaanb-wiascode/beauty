import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Manager actionable leave authorization', () => {
  const query = jest.fn();
  const canAct = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    { canAct } as unknown as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );
  beforeEach(() => { query.mockReset(); canAct.mockReset(); });

  it('returns an empty set when the manager has no matching requests', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerActionableLeaves('user-1', 'role-1')).resolves.toEqual({ data: [] });
    expect(canAct).not.toHaveBeenCalled();
  });

  it('excludes approvals denied by the existing workflow policy', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }])
      .mockResolvedValueOnce([{ id: 'leave-1', firstName: 'Ece', lastName: 'Demir', startDate: '2026-11-01', endDate: '2026-11-02', days: '2', leaveType: 'Yıllık' }])
      .mockResolvedValueOnce([{ id: 'approval-1', entityId: 'leave-1' }]);
    canAct.mockResolvedValueOnce(false);
    await expect(service.mobileManagerActionableLeaves('user-1', 'role-1')).resolves.toEqual({ data: [] });
    expect(canAct).toHaveBeenCalledWith('approval-1', { userId: 'user-1', roleId: 'role-1' });
    expect(query.mock.calls[2].slice(1)).toEqual(['tenant-1', 'company-1', ['leave-1']]);
  });

  it('does not query approvals without an authenticated role', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerActionableLeaves('user-1', '')).resolves.toEqual({ data: [] });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
