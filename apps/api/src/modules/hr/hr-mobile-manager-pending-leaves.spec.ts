import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Mobile manager pending leave access scope', () => {
  const query = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-a', getCompanyId: () => 'company-a' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );

  beforeEach(() => query.mockReset());

  it('returns pending leave requests only for active direct reports in the same company', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-a', branchId: 'branch-a' }])
      .mockResolvedValueOnce([{
        id: 'request-a', firstName: 'Ayşe', lastName: 'Yılmaz', leaveType: 'Yıllık izin',
        startDate: '2026-11-01', endDate: '2026-11-02', days: '2',
      }]);

    await expect(service.mobileManagerPendingLeaves('user-a')).resolves.toEqual({
      data: [{
        id: 'request-a', firstName: 'Ayşe', lastName: 'Yılmaz', leaveType: 'Yıllık izin',
        startDate: '2026-11-01', endDate: '2026-11-02', days: '2',
      }],
    });

    expect(query.mock.calls[1]?.[0]).toContain('a.manager_staff_id=$3');
    expect(query.mock.calls[1]?.[0]).toContain('r.status=\'PENDING\'');
    expect(query.mock.calls[1]?.[0]).toContain('a.effective_from<=CURRENT_DATE');
    expect(query.mock.calls[1]?.[0]).toContain('b."companyId"=$2');
    expect(query.mock.calls[1]?.[0]).toContain('LIMIT 50');
    expect(query.mock.calls[1]?.slice(1)).toEqual(['tenant-a', 'company-a', 'manager-a']);
  });
});
