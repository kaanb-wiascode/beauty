import { ResendEmailMessageProvider } from './resend-email-message.provider';

describe('ResendEmailMessageProvider', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const connections = { getScoped: jest.fn() };
  const vault = { load: jest.fn() };
  const registry = { register: jest.fn() };

  function makeProvider() {
    return new ResendEmailMessageProvider(
      prisma as never,
      connections as never,
      vault as never,
      registry as never,
    );
  }

  beforeEach(() => jest.resetAllMocks());

  it('registers itself and sends through branch-scoped Resend configuration', async () => {
    const provider = makeProvider();
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
    ]);
    connections.getScoped.mockResolvedValue({
      id: 'connection-1',
      enabled: true,
      publicConfig: { fromEmail: 'hello@example.com', fromName: 'Beauty ERP' },
    });
    vault.load.mockResolvedValue({ apiKey: 're_123456789012345678901234567890' });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-123' }),
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as never;
    try {
      await expect(provider.send({
        messageId: 'message-1',
        channel: 'EMAIL',
        recipient: 'customer@example.com',
        subject: 'Randevu',
        body: 'Merhaba',
        idempotencyKey: 'message-key-1',
      })).resolves.toEqual({ externalMessageId: 'email-123', status: 'QUEUED' });
    } finally {
      global.fetch = previousFetch;
    }

    expect(connections.getScoped).toHaveBeenCalledWith('resend-email', 'EMAIL', {
      tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(request.headers?.['Idempotency-Key']).toBe('message-key-1');
  });

  it('fails closed when the branch connection is disabled', async () => {
    const provider = makeProvider();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
    ]);
    connections.getScoped.mockResolvedValue({ id: 'connection-1', enabled: false, publicConfig: {} });

    await expect(provider.send({
      messageId: 'message-1', channel: 'EMAIL', recipient: 'customer@example.com', body: 'Merhaba',
    })).rejects.toThrow('not enabled');
    expect(vault.load).not.toHaveBeenCalled();
  });
});
