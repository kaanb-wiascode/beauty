import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Manager mobile leave decisions', () => {
  const query = jest.fn();
  const canAct = jest.fn();
  const act = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    { canAct, act } as unknown as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );
  beforeEach(() => { query.mockReset(); canAct.mockReset(); act.mockReset(); });

  it('rejects unsupported actions and missing rejection reason', async () => {
    await expect(service.mobileManagerLeaveDecision('u1','r1','a1','CANCEL' as 'APPROVE')).rejects.toThrow(BadRequestException);
    await expect(service.mobileManagerLeaveDecision('u1','r1','a1','REJECT',' ')).rejects.toThrow(BadRequestException);
    expect(act).not.toHaveBeenCalled();
  });

  it('denies a decision absent an actionable workflow approval', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerLeaveDecision('u1','r1','a1','APPROVE')).rejects.toThrow(NotFoundException);
    expect(act).not.toHaveBeenCalled();
  });
  it('delegates a permitted approval to the workflow engine', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }])
      .mockResolvedValueOnce([{ id: 'leave-1', firstName: 'Ece', lastName: 'Demir', startDate: '2026-11-01', endDate: '2026-11-02', days: '2', leaveType: 'Yıllık' }])
      .mockResolvedValueOnce([{ id: 'approval-1', entityId: 'leave-1' }]);
    canAct.mockResolvedValueOnce(true);
    act.mockResolvedValueOnce({ status: 'APPROVED' });
    await expect(service.mobileManagerLeaveDecision('u1', 'r1', 'approval-1', 'APPROVE')).resolves.toEqual({ status: 'APPROVED' });
    expect(act).toHaveBeenCalledWith('approval-1', 'APPROVE', { userId: 'u1', roleId: 'r1' }, undefined);
  });

  it('blocks a workflow decision when its approval step is not authorized', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }])
      .mockResolvedValueOnce([{ id: 'leave-1' }])
      .mockResolvedValueOnce([{ id: 'approval-1', entityId: 'leave-1' }]);
    canAct.mockResolvedValueOnce(false);
    await expect(service.mobileManagerLeaveDecision('u1', 'r1', 'approval-1', 'REJECT', 'Gerekçe')).rejects.toThrow(NotFoundException);
    expect(act).not.toHaveBeenCalled();
  });

});
