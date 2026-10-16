import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Manager mobile attendance decisions', () => {
  const query = jest.fn();
  const inbox = jest.fn();
  const act = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    { inbox, act } as unknown as ApprovalRuntimeService,
  );
  beforeEach(() => { query.mockReset(); inbox.mockReset(); act.mockReset(); });

  it('rejects invalid decisions and empty rejection reason before loading data', async () => {
    await expect(service.mobileManagerAttendanceDecision('user-1', 'approval-1', 'CANCEL' as 'APPROVE')).rejects.toThrow(BadRequestException);
    await expect(service.mobileManagerAttendanceDecision('user-1', 'approval-1', 'REJECT', ' ')).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(act).not.toHaveBeenCalled();
  });

  it('does not call runtime act for non-actionable requests', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerAttendanceDecision('user-1', 'approval-1', 'APPROVE')).rejects.toThrow(NotFoundException);
    expect(act).not.toHaveBeenCalled();
  });

  it('revalidates through runtime act after actionable scope check', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }])
      .mockResolvedValueOnce([{ id: 'event-1', approvalRequestId: 'approval-1' }]);
    inbox.mockResolvedValueOnce([{ id: 'approval-1', entityType: 'hr_attendance_event' }]);
    act.mockResolvedValueOnce({ success: true });
    await expect(service.mobileManagerAttendanceDecision('user-1', 'approval-1', 'APPROVE')).resolves.toEqual({ success: true });
    expect(act).toHaveBeenCalledWith('approval-1', 'APPROVE', undefined);
  });
});
