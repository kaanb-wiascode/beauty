import { TwilioSmsMessageProvider } from './twilio-sms-message.provider';

describe('TwilioSmsMessageProvider', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const connections = { getScoped: jest.fn() };
  const vault = { load: jest.fn() };
  const registry = { register: jest.fn() };

  function provider() {
    return new TwilioSmsMessageProvider(
      prisma as never,
      connections as never,
      vault as never,
      registry as never,
    );
  }

  beforeEach(() => jest.resetAllMocks());

  it('registers itself and sends with branch-scoped encrypted credentials', async () => {
    const instance = provider();
    instance.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(instance);
    prisma.$queryRawUnsafe.mockResolvedValue([
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
    ]);
    connections.getScoped.mockResolvedValue({
      id: 'connection-1',
      enabled: true,
      publicConfig: { fromNumber: '+905551112233' },
    });
    vault.load.mockResolvedValue({
      accountSid: 'AC11111111111111111111111111111111',
      authToken: 'twilio-auth-token-value',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM11111111111111111111111111111111', status: 'queued' }),
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as never;
    try {
      await expect(
        instance.send({
          messageId: 'message-1',
          channel: 'SMS',
          recipient: '+90 555 222 33 44',
          body: 'Randevu hatırlatması',
        }),
      ).resolves.toEqual({
        externalMessageId: 'SM11111111111111111111111111111111',
        status: 'QUEUED',
      });
    } finally {
      global.fetch = previousFetch;
    }
    expect(connections.getScoped).toHaveBeenCalledWith('twilio-sms', 'SMS', {
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC11111111111111111111111111111111/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        body: expect.stringContaining('Body=Randevu+hat%C4%B1rlatmas%C4%B1'),
      }),
    );
  });

  it('rejects non-E.164 recipients before calling Twilio', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
    ]);
    connections.getScoped.mockResolvedValue({
      id: 'connection-1',
      enabled: true,
      publicConfig: { fromNumber: '+905551112233' },
    });
    vault.load.mockResolvedValue({
      accountSid: 'AC11111111111111111111111111111111',
      authToken: 'twilio-auth-token-value',
    });
    await expect(
      provider().send({
        messageId: 'message-1',
        channel: 'SMS',
        recipient: '555',
        body: 'Test',
      }),
    ).rejects.toThrow('E.164');
  });
});
