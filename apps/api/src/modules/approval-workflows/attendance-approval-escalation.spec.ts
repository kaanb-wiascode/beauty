import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { ApprovalRuntimeService } from './approval-runtime.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

describe('Attendance approval deadline escalation', () => {
  const service = new ApprovalRuntimeService(
    {} as PrismaService, {} as TenantContext, {} as PlatformAuditService,
  );
  const actor = 'branch-manager-user';
  const request = { id: 'request-1', tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
  const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
  const check = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    check.mockReset();
    jest.spyOn(service as any, 'authorizedByType').mockImplementation(check);
    jest.spyOn(service as any, 'authorizedByGlobalDelegation').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['clock in/out', 15],
    ['break start/end', 2],
  ])('allows branch-manager escalation after the %s deadline (%i minutes)', async (_label, minutes) => {
    check.mockImplementation(async (_actor: string, _request: unknown, type: string) => type === 'BRANCH_MANAGER');
    const step = {
      stepOrder: 1, approverType: 'DIRECT_MANAGER', approverValue: null,
      approverPermission: null, approverRoleSlug: null, slaMinutes: minutes,
      escalationApproverType: 'BRANCH_MANAGER', escalationApproverValue: null,
      timeoutAction: 'ESCALATE', startedAt: new Date(Date.now() - (minutes * 60_000 + 1000)),
    };
    await expect((service as any).assertApprover(actor, request, step, tx)).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledWith(actor, request, 'BRANCH_MANAGER', null, tx);
  });

  it.each([15, 2])('does not escalate before the %i minute deadline', async (minutes) => {
    check.mockResolvedValue(false);
    const step = {
      stepOrder: 1, approverType: 'DIRECT_MANAGER', approverValue: null,
      approverPermission: null, approverRoleSlug: null, slaMinutes: minutes,
      escalationApproverType: 'BRANCH_MANAGER', escalationApproverValue: null,
      timeoutAction: 'ESCALATE', startedAt: new Date(Date.now() - (minutes * 60_000 - 30_000)),
    };
    await expect((service as any).assertApprover(actor, request, step, tx)).rejects.toThrow(ForbiddenException);
    expect(check).not.toHaveBeenCalledWith(actor, request, 'BRANCH_MANAGER', null, tx);
  });
});
