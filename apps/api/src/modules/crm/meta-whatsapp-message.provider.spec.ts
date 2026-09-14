import { createHmac } from 'node:crypto';
import { MetaWhatsAppMessageProvider } from './meta-whatsapp-message.provider';

describe('MetaWhatsAppMessageProvider', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const connections = {
    getScoped: jest.fn(),
    findMetaByPhoneNumberId: jest.fn(),
  };
  const vault = { load: jest.fn() };
  const registry = { register: jest.fn() };

  function makeProvider() {
    return new MetaWhatsAppMessageProvider(
      prisma as never,
      connections as never,
      vault as never,
      registry as never,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('registers itself and sends through branch-scoped Meta configuration', async () => {
    const provider = makeProvider();
    provider.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(provider);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1' },
    ]);
    connections.getScoped.mockResolvedValue({
      id: 'connection-1',
      enabled: true,
      publicConfig: { phoneNumberId: '12345', graphApiVersion: 'v23.0' },
    });
    vault.load.mockResolvedValue({ accessToken: 'token-value' });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.123' }] }),
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as never;
    try {
      await expect(provider.send({
        messageId: 'message-1',
        channel: 'WHATSAPP',
        recipient: '+90 555 111 22 33',
        body: 'Merhaba',
      })).resolves.toEqual({ externalMessageId: 'wamid.123', status: 'QUEUED' });
    } finally {
      global.fetch = previousFetch;
    }

    expect(connections.getScoped).toHaveBeenCalledWith('meta-whatsapp', 'WHATSAPP', {
      tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/12345/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('verifies signed callbacks and normalizes delivery receipts', async () => {
    const provider = makeProvider();
    const body = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: '12345', display_phone_number: '905551112233' },
        statuses: [{ id: 'wamid.123', status: 'delivered', timestamp: '1' }],
      } }] }],
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const secret = 'app-secret-value';
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    connections.findMetaByPhoneNumberId.mockResolvedValue({
      id: 'connection-1', tenantId: 'tenant-1', companyId: 'company-1', branchId: 'branch-1', publicConfig: {},
    });
    vault.load.mockResolvedValue({ appSecret: secret });

    const request = { body, rawBody, headers: { 'x-hub-signature-256': signature } };
    await expect(provider.verifyWebhook(request)).resolves.toBe(true);
    await expect(provider.parseWebhook(request)).resolves.toEqual(expect.objectContaining({
      type: 'DELIVERY',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      externalMessageId: 'wamid.123',
      status: 'DELIVERED',
    }));
  });
});
