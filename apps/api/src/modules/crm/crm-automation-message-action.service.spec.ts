import { CrmAutomationMessageActionService } from './crm-automation-message-action.service';

describe('CrmAutomationMessageActionService', () => {
  const scope = { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' };
  const marker = {
    id: 'event-1',
    branchId: 'branch-1',
    leadId: 'lead-1',
    opportunityId: null,
    actorUserId: 'user-1',
    ruleKey: 'LEAD_FIRST_TOUCH' as const,
  };

  it('marks disabled message actions without sending anything', async () => {
    const query = jest.fn().mockResolvedValueOnce([marker]);
    const execute = jest.fn().mockResolvedValue(1);
    const resolve = jest.fn();
    const service = new CrmAutomationMessageActionService(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
      { get: jest.fn().mockResolvedValue({ config: { messageEnabled: false } }) } as never,
      { resolve } as never,
    );

    await expect(service.process(scope)).resolves.toEqual({ scanned: 1, sent: 0, failed: 0, skipped: 1 });
    expect(resolve).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO crm_events'),
      'tenant-1', 'company-1', 'branch-1', 'lead-1', null, 'user-1', expect.stringContaining('"messageSourceEventId":"event-1"'),
    );
  });

  it('persists a failed message when no provider is available', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("markerOnly'='true'")) return [marker];
      if (sql.includes('COALESCE(l.phone')) return [{ phone: '+905551112233', email: null }];
      if (sql.includes('SELECT id FROM crm_messages')) return [];
      if (sql.includes('INSERT INTO crm_messages')) return [{ id: 'message-1' }];
      return [];
    });
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmAutomationMessageActionService(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
      { get: jest.fn().mockResolvedValue({ config: { messageEnabled: true, messageChannel: 'WHATSAPP', messageTemplate: 'Merhaba' } }) } as never,
      { resolve: jest.fn().mockReturnValue(null) } as never,
    );

    await expect(service.process(scope)).resolves.toEqual({ scanned: 1, sent: 0, failed: 1, skipped: 0 });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("status='FAILED'"),
      'message-1',
      'No configured provider is available.',
    );
  });
});
