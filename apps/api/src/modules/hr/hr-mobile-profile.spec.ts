import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { HrSelfServiceService } from './hr-self-service.service';
import { Employee360Service } from './employee-360.service';
import { LeavePolicyService } from './leave-policy.service';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

describe('HR mobile profile privacy boundary', () => {
  const employeeQuery = jest.fn();
  const branchLookup = jest.fn();
  const prisma = {
    $queryRawUnsafe: employeeQuery,
    branch: { findFirst: branchLookup },
  };
  const context = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
  };
  const service = new HrSelfServiceService(
    prisma as unknown as PrismaService,
    context as unknown as TenantContext,
    {} as Employee360Service,
    {} as LeavePolicyService,
    {} as ApprovalWorkflowService,
    {} as ApprovalRuntimeService,
  );

  beforeEach(() => {
    employeeQuery.mockReset();
    branchLookup.mockReset();
  });

  it('returns only employee identity and company-scoped branch name', async () => {
    employeeQuery.mockResolvedValue([
      {
        id: 'staff-1', branchId: 'branch-1',
        firstName: 'Ayşe', lastName: 'Yılmaz',
        email: 'private@example.com', status: 'ACTIVE',
      },
    ]);
    branchLookup.mockResolvedValue({ id: 'branch-1', name: 'Merkez' });
    await expect(service.mobileProfile('user-1')).resolves.toEqual({
      id: 'staff-1',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      status: 'ACTIVE',
      branch: { id: 'branch-1', name: 'Merkez' },
    });
    expect(branchLookup).toHaveBeenCalledWith({
      where: { id: 'branch-1', companyId: 'company-1' },
      select: { id: true, name: true },
    });
  });

  it('does not return a profile without a linked employee', async () => {
    employeeQuery.mockResolvedValue([]);
    await expect(service.mobileProfile('user-2')).rejects.toThrow(
      NotFoundException,
    );
    expect(branchLookup).not.toHaveBeenCalled();
  });
});
