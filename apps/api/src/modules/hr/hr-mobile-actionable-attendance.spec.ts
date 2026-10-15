import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Manager actionable attendance', () => {
  const query = jest.fn();
  const inbox = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    { inbox } as unknown as ApprovalRuntimeService,
  );
  beforeEach(() => { query.mockReset(); inbox.mockReset(); });

  it('returns no actions and avoids the inbox when no direct reports have requests', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerActionableAttendance('user-1')).resolves.toEqual({ data: [] });
    expect(inbox).not.toHaveBeenCalled();
  });

  it('excludes requests not authorized by the runtime inbox', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }])
      .mockResolvedValueOnce([
        { id: 'event-1', approvalRequestId: 'request-1' },
        { id: 'event-2', approvalRequestId: 'request-2' },
      ]);
    inbox.mockResolvedValueOnce([
      { id: 'request-1', entityType: 'hr_attendance_event' },
      { id: 'request-2', entityType: 'other_event' },
    ]);
    await expect(service.mobileManagerActionableAttendance('user-1')).resolves.toEqual({
      data: [{ id: 'event-1', approvalRequestId: 'request-1' }],
    });
    expect(inbox).toHaveBeenCalledWith('PENDING');
  });
});
