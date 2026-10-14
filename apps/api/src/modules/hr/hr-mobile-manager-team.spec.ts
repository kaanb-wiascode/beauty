import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('HR mobile manager team scope', () => {
  const query = jest.fn();
  const context = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
  };
  const service = new HrSelfServiceService(
    { $queryRawUnsafe: query } as unknown as PrismaService,
    context as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );

  beforeEach(() => query.mockReset());

  it('returns only direct reports and whitelisted fields', async () => {
    query
      .mockResolvedValueOnce([{ id: 'manager-1', branchId: 'branch-1' }])
      .mockResolvedValueOnce([{
        id: 'staff-2', firstName: 'Ece', lastName: 'Yılmaz',
        status: 'ACTIVE', branchId: 'branch-1', branchName: 'Merkez',
        email: 'private@example.com',
      }]);
    await expect(service.mobileManagerTeam('user-1')).resolves.toEqual({
      data: [{
        id: 'staff-2', firstName: 'Ece', lastName: 'Yılmaz',
        status: 'ACTIVE', branch: { id: 'branch-1', name: 'Merkez' },
      }],
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('a.manager_staff_id=$3'),
      'tenant-1',
      'company-1',
      'manager-1',
    );
  });

  it('rejects users without an employee mapping', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.mobileManagerTeam('user-2')).rejects.toThrow(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
