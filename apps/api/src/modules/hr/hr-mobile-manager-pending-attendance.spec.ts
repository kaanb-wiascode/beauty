import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('Mobile manager pending attendance scope', () => {
  const query = jest.fn();
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    { getTenantId: () => 'tenant-1', getCompanyId: () => 'company-1' } as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );
  beforeEach(() => query.mockReset());

  it('filters attendance requests by direct manager, company and pending status', async () => {
    query.mockResolvedValueOnce([{ id: 'manager-1' }]).mockResolvedValueOnce([]);
    await expect(service.mobileManagerPendingAttendance('user-1')).resolves.toEqual({ data: [] });
    const sql = String(query.mock.calls[1][0]);
    expect(sql).toContain('a.manager_staff_id=$3');
    expect(sql).toContain('e.company_id=$2');
    expect(sql).toContain('r.status=\'PENDING\'');
    expect(sql).toContain('b."companyId"=$2');
    expect(sql).toContain('LIMIT 50');
    expect(query.mock.calls[1].slice(1)).toEqual(['tenant-1','company-1','manager-1']);
  });
});
