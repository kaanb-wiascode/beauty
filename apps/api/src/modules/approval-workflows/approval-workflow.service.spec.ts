import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { ApprovalWorkflowService } from './approval-workflow.service';

describe('ApprovalWorkflowService', () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const membershipFindFirst = jest.fn();
  const auditRecord = jest.fn();

  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = {
    membership: { findFirst: membershipFindFirst },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;
  const tenantContext = {
    getContext: () => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      membershipId: 'membership-admin',
      branchId: null,
      roleScope: 'CENTRAL',
    }),
  } as unknown as TenantContext;
  const audit = { record: auditRecord } as unknown as PlatformAuditService;
  const service = new ApprovalWorkflowService(prisma, tenantContext, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    membershipFindFirst.mockResolvedValue({ userId: 'admin-user' });
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    executeRaw.mockResolvedValue(1);
    auditRecord.mockResolvedValue({ id: 'audit-1' });
  });

  it('creates the next immutable workflow version', async () => {
    queryRaw
      .mockResolvedValueOnce([{ version: 2 }])
      .mockResolvedValueOnce([{
        id: 'workflow-v3', tenantId: 'tenant-1', companyId: 'company-1',
        workflowKey: 'expense-approval', name: 'Expense Approval', domain: 'finance',
        description: null, version: 3, status: 'DRAFT', conditions: {},
        steps: [{ key: 'manager', name: 'Manager' }], createdByUserId: 'admin-user',
        publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
      }]);

    const result = await service.create({
      workflowKey: 'expense-approval',
      name: 'Expense Approval',
      domain: 'finance',
      conditions: {},
      steps: [{ key: 'manager', name: 'Manager' }],
    });

    expect(result.version).toBe(3);
    expect(result.status).toBe('DRAFT');
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it('does not allow a published workflow to be edited in place', async () => {
    queryRaw.mockResolvedValueOnce([{
      id: 'workflow-v1', tenantId: 'tenant-1', companyId: 'company-1',
      workflowKey: 'leave', name: 'Leave', domain: 'hr', description: null,
      version: 1, status: 'PUBLISHED', conditions: {}, steps: [{ key: 'hr', name: 'HR' }],
      createdByUserId: 'admin-user', publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }]);

    await expect(service.updateDraft('workflow-v1', { name: 'Changed' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('publishes a draft and archives the previously published version', async () => {
    queryRaw
      .mockResolvedValueOnce([{
        id: 'workflow-v2', tenantId: 'tenant-1', companyId: 'company-1',
        workflowKey: 'expense-approval', name: 'Expense Approval', domain: 'finance',
        description: null, version: 2, status: 'DRAFT', conditions: {},
        steps: [{ key: 'finance', name: 'Finance' }], createdByUserId: 'admin-user',
        publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
      }])
      .mockResolvedValueOnce([{
        id: 'workflow-v2', tenantId: 'tenant-1', companyId: 'company-1',
        workflowKey: 'expense-approval', name: 'Expense Approval', domain: 'finance',
        description: null, version: 2, status: 'PUBLISHED', conditions: {},
        steps: [{ key: 'finance', name: 'Finance' }], createdByUserId: 'admin-user',
        publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      }]);

    const result = await service.publish('workflow-v2');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PUBLISHED');
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });
});
