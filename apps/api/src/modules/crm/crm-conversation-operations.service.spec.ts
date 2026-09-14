import { BadRequestException } from '@nestjs/common';
import { CrmConversationOperationsService } from './crm-conversation-operations.service';

describe('CrmConversationOperationsService', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('returns safe SLA defaults when branch has no override', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmConversationOperationsService(
      { $queryRawUnsafe: query } as never,
      { getContext: () => context } as never,
    );

    await expect(service.policy()).resolves.toMatchObject({
      whatsappTargetMinutes: 120,
      smsTargetMinutes: 120,
      emailTargetMinutes: 240,
      criticalAfterMinutes: 1440,
      version: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('crm_conversation_sla_policies'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('requires an active branch for ownership operations', async () => {
    const service = new CrmConversationOperationsService(
      { $queryRawUnsafe: jest.fn() } as never,
      { getContext: () => ({ ...context, branchId: null }) } as never,
    );
    await expect(service.policy()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates subject and assignee scope before creating an assignment', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'customer-1' }])
      .mockResolvedValueOnce([{ id: 'user-2' }]);
    const txQuery = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'assignment-1', version: 1 }]);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({
      $queryRawUnsafe: txQuery,
      $executeRawUnsafe: jest.fn(),
    }));
    const service = new CrmConversationOperationsService(
      { $queryRawUnsafe: query, $transaction: transaction } as never,
      { getContext: () => context } as never,
    );

    await expect(service.setAssignment('CUSTOMER', 'customer-1', 'user-2', 0, 'actor-1')).resolves.toMatchObject({
      assignedUserId: 'user-2',
      version: 1,
    });
    expect(query.mock.calls[0][0]).toContain('FROM customers');
    expect(query.mock.calls[1][0]).toContain('membership_branch_access');
    expect(txQuery.mock.calls[1][0]).toContain('INSERT INTO crm_conversation_assignments');
  });
});
