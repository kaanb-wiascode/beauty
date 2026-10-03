import { CrmInboundOptOutService } from './crm-inbound-opt-out.service';

describe('CrmInboundOptOutService', () => {
  const base = {
    type: 'INBOUND' as const,
    externalEventId: 'evt-1',
    externalMessageId: 'msg-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
    channel: 'WHATSAPP' as const,
    sender: '+905551112233',
    recipient: '+902120000000',
    customerId: 'customer-1',
  };

  it('ignores ordinary inbound text', async () => {
    const query = jest.fn();
    const execute = jest.fn();
    const service = new CrmInboundOptOutService();

    await expect(service.apply({ $queryRawUnsafe: query, $executeRawUnsafe: execute } as never, {
      ...base,
      body: 'Merhaba',
    })).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('records an append-only opt-out event for STOP', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'permission-1' }]);
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmInboundOptOutService();

    await expect(service.apply({ $queryRawUnsafe: query, $executeRawUnsafe: execute } as never, {
      ...base,
      body: ' STOP ',
    })).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain('crm_contact_channel_permissions');
    expect(query.mock.calls[1][0]).toContain('INSERT INTO crm_contact_channel_permissions');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('crm_contact_channel_permission_events'),
      'tenant-1',
      'company-1',
      'branch-1',
      'permission-1',
      'customer-1',
      null,
      'WHATSAPP',
      null,
      expect.stringContaining('STOP'),
    );
  });
});
