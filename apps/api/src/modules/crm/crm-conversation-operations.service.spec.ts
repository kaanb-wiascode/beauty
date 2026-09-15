import { BadRequestException, ConflictException } from '@nestjs/common';
import { CrmConversationOperationsService } from './crm-conversation-operations.service';

describe('CrmConversationOperationsService', () => {
  const context = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };

  it('returns safe SLA defaults when branch has no override', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query } as never,{ getContext: () => context } as never);
    await expect(service.policy()).resolves.toMatchObject({ whatsappTargetMinutes: 120, smsTargetMinutes: 120, emailTargetMinutes: 240, criticalAfterMinutes: 1440, version: 0 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('crm_conversation_sla_policies'),'tenant-1','company-1','branch-1');
  });

  it('requires an active branch for ownership operations', async () => {
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: jest.fn() } as never,{ getContext: () => ({ ...context, branchId: null }) } as never);
    await expect(service.policy()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates subject and assignee scope before creating an assignment', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]).mockResolvedValueOnce([{ id: 'user-2' }]);
    const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'assignment-1', version: 1 }]);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({ $queryRawUnsafe: txQuery, $executeRawUnsafe: jest.fn() }));
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query, $transaction: transaction } as never,{ getContext: () => context } as never);
    await expect(service.setAssignment('CUSTOMER','customer-1','user-2',0,'actor-1')).resolves.toMatchObject({ assignedUserId: 'user-2', version: 1 });
    expect(query.mock.calls[0][0]).toContain('FROM customers'); expect(query.mock.calls[1][0]).toContain('membership_branch_access');
    expect(txQuery.mock.calls[1][0]).toContain('INSERT INTO crm_conversation_assignments');
  });

  it('creates a snoozed lifecycle state with optimistic version zero and append-only event', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'lead-1' }]);
    const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'state-1', version: 1, resolvedAt: null, closedAt: null }]);
    const txExecute = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({ $queryRawUnsafe: txQuery, $executeRawUnsafe: txExecute }));
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query, $transaction: transaction } as never,{ getContext: () => context } as never);
    const until = new Date(Date.now() + 60_000);
    await expect(service.setState('LEAD','lead-1','SNOOZED',until,undefined,0,'actor-1')).resolves.toMatchObject({ status: 'SNOOZED', priority: 'NORMAL', version: 1, snoozedUntil: until });
    expect(txQuery.mock.calls[1][0]).toContain('INSERT INTO crm_conversation_states');
    expect(txExecute.mock.calls[0][0]).toContain('INSERT INTO crm_conversation_state_events');
  });

  it('resolves a conversation with priority and records the previous lifecycle state', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]);
    const txQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 'state-1', version: 3, status: 'PENDING', priority: 'HIGH' }])
      .mockResolvedValueOnce([{ id: 'state-1', version: 4, resolvedAt: new Date('2026-09-15T03:30:00.000Z'), closedAt: null }]);
    const txExecute = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({ $queryRawUnsafe: txQuery, $executeRawUnsafe: txExecute }));
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query, $transaction: transaction } as never,{ getContext: () => context } as never);

    await expect(service.setState('CUSTOMER','customer-1','RESOLVED',null,'URGENT',3,'actor-1')).resolves.toMatchObject({
      status: 'RESOLVED', priority: 'URGENT', version: 4,
    });
    expect(txQuery.mock.calls[1][0]).toContain("resolved_at=CASE WHEN $2='RESOLVED' THEN NOW()");
    expect(txExecute).toHaveBeenCalledWith(expect.stringContaining('crm_conversation_state_events'),
      'state-1','tenant-1','company-1','branch-1','customer-1',null,null,'PENDING','RESOLVED','HIGH','URGENT',4,'actor-1');
  });

  it('rejects stale lifecycle versions before mutating state', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]);
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: 'state-1', version: 5, status: 'OPEN', priority: 'NORMAL' }]);
    const transaction = jest.fn(async (callback: (tx: unknown) => unknown) => callback({ $queryRawUnsafe: txQuery, $executeRawUnsafe: jest.fn() }));
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query, $transaction: transaction } as never,{ getContext: () => context } as never);
    await expect(service.setState('CUSTOMER','customer-1','PENDING',null,'HIGH',4,'actor-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects snooze timestamps that are not in the future', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]);
    const service = new CrmConversationOperationsService({ $queryRawUnsafe: query } as never,{ getContext: () => context } as never);
    await expect(service.setState('CUSTOMER','customer-1','SNOOZED',new Date(0),undefined,0,'actor-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
