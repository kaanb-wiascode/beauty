import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Default attendance approval SLA', () => {
  const service = new HrSelfServiceService(
    {} as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service, {} as LeavePolicyService,
    {} as ApprovalWorkflowService, {} as ApprovalRuntimeService,
  );

  it.each([
    ['hr.attendance-clock', 15],
    ['hr.attendance-break', 2],
  ] as const)('publishes %s with %i minute manager SLA', async (workflowKey, expectedMinutes) => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ version: 0 }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRaw: query, $executeRaw: execute };
    await (service as any).ensureAttendanceApprovalWorkflow(tx, 'user-1', workflowKey);
    expect(execute).toHaveBeenCalledTimes(1);
    const payload = execute.mock.calls[0].slice(1).find((value: unknown) =>
      typeof value === 'string' && value.includes('manager-approval'));
    expect(typeof payload).toBe('string');
    const steps = JSON.parse(payload as string);
    expect(steps).toEqual([expect.objectContaining({
      approverType: 'DIRECT_MANAGER',
      slaMinutes: expectedMinutes,
      timeoutAction: 'ESCALATE',
      escalationApproverType: 'BRANCH_MANAGER',
    })]);
  });

  it('does not overwrite an already published workflow definition', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([{ id: 'published-1' }]);
    const execute = jest.fn();
    await (service as any).ensureAttendanceApprovalWorkflow(
      { $queryRaw: query, $executeRaw: execute },
      'user-1',
      'hr.attendance-clock',
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
