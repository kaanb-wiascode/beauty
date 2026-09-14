import { ServiceUnavailableException } from '@nestjs/common';
import { CrmMessageProviderRegistryService } from './crm-message-provider-registry.service';
import { CrmMessageService } from './crm-message.service';

const scope = {
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH' as const,
};

const baseMessage = {
  id: '11111111-1111-1111-1111-111111111111',
  customerId: '22222222-2222-2222-2222-222222222222',
  leadId: null,
  opportunityId: null,
  direction: 'OUTBOUND' as const,
  channel: 'WHATSAPP' as const,
  status: 'DRAFT',
  providerKey: null,
  recipient: '+905551112233',
  subject: null,
  body: 'Merhaba',
  idempotencyKey: 'message-key-1',
  externalMessageId: null,
  errorMessage: null,
  version: 1,
  createdByUserId: 'actor-1',
  sentAt: null,
  deliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeService() {
  const query = jest.fn();
  const execute = jest.fn().mockResolvedValue(1);
  const providers = new CrmMessageProviderRegistryService();
  const service = new CrmMessageService(
    { $queryRawUnsafe: query, $executeRawUnsafe: execute } as never,
    { getContext: () => scope } as never,
    providers,
  );
  return { service, query, execute, providers };
}

describe('CrmMessageService', () => {
  it('lists messages inside tenant/company/branch scope', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);

    await service.list({ customerId: baseMessage.customerId, limit: 20 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM crm_messages'),
      'tenant-1',
      'company-1',
      'branch-1',
      baseMessage.customerId,
      null,
      null,
      20,
    );
  });

  it('logs a real-world manual outbound communication without pretending to use a provider', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ ...baseMessage, status: 'SENT', providerKey: 'MANUAL' }]);

    const result = await service.logManual(
      {
        customerId: baseMessage.customerId,
        direction: 'OUTBOUND',
        channel: 'WHATSAPP',
        recipient: baseMessage.recipient,
        body: 'Merhaba',
      },
      'actor-1',
    );

    expect(result.providerKey).toBe('MANUAL');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'MANUAL'"),
      'tenant-1',
      'company-1',
      'branch-1',
      baseMessage.customerId,
      null,
      null,
      'OUTBOUND',
      'WHATSAPP',
      'SENT',
      baseMessage.recipient,
      null,
      'Merhaba',
      'actor-1',
      null,
    );
  });

  it('refuses provider send when no real provider is configured', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([baseMessage]);

    await expect(service.send(baseMessage.id, 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('claims a draft by version and records a configured provider result', async () => {
    const { service, query, providers } = makeService();
    const send = jest.fn().mockResolvedValue({
      externalMessageId: 'provider-message-1',
      status: 'SENT',
    });
    providers.register({ key: 'test-provider', channels: ['WHATSAPP'], send });
    query
      .mockResolvedValueOnce([baseMessage])
      .mockResolvedValueOnce([{ ...baseMessage, status: 'QUEUED', providerKey: 'test-provider', version: 2 }])
      .mockResolvedValueOnce([{ ...baseMessage, status: 'SENT', providerKey: 'test-provider', externalMessageId: 'provider-message-1', version: 3 }]);

    const result = await service.send(baseMessage.id, 1);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      messageId: baseMessage.id,
      channel: 'WHATSAPP',
      recipient: baseMessage.recipient,
      idempotencyKey: 'message-key-1',
    }));
    expect(query.mock.calls[1]?.[0]).toContain("status='QUEUED'");
    expect(query.mock.calls[1]?.[5]).toBe(1);
    expect(result.status).toBe('SENT');
  });
});
