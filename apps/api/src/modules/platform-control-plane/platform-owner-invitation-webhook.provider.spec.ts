import { createHmac } from 'node:crypto';

import {
  PlatformInvitationProviderError,
  PlatformOwnerInvitationWebhookProvider,
} from './platform-owner-invitation-webhook.provider';

describe('PlatformOwnerInvitationWebhookProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs the delivery body and returns the provider message id', async () => {
    const secret = 's'.repeat(32);
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          PLATFORM_INVITATION_WEBHOOK_URL: 'https://delivery.example.test/invitations',
          PLATFORM_INVITATION_WEBHOOK_SECRET: secret,
          PLATFORM_INVITATION_WEBHOOK_TIMEOUT_MS: 5000,
        };
        return values[key];
      }),
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'message-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new PlatformOwnerInvitationWebhookProvider(config as never);

    const request = {
      deliveryId: 'delivery-1',
      provisioningRunId: 'run-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      email: 'owner@example.com',
      invitationToken: 'ephemeral-secret-token',
      expiresAt: '2026-09-18T00:00:00.000Z',
      acceptApiUrl: 'https://api.example.test/auth/invitations/accept',
    };
    const result = await provider.send(request);

    expect(result).toEqual({ providerMessageId: 'message-1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const body = String(init?.body);
    const headers = init?.headers as Record<string, string>;
    const timestamp = headers['x-valoo-platform-timestamp'];
    const expectedSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    expect(headers['x-valoo-platform-signature']).toBe(expectedSignature);
    expect(JSON.parse(body)).toMatchObject({
      event: 'PLATFORM_OWNER_INVITATION',
      invitationToken: 'ephemeral-secret-token',
    });
  });

  it('marks 503 responses as retryable provider failures', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'PLATFORM_INVITATION_WEBHOOK_URL') {
          return 'https://delivery.example.test/invitations';
        }
        if (key === 'PLATFORM_INVITATION_WEBHOOK_SECRET') return 'x'.repeat(32);
        return 5000;
      }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new PlatformOwnerInvitationWebhookProvider(config as never);

    await expect(
      provider.send({
        deliveryId: 'delivery-1',
        provisioningRunId: 'run-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        email: 'owner@example.com',
        invitationToken: 'ephemeral-secret-token',
        expiresAt: '2026-09-18T00:00:00.000Z',
        acceptApiUrl: null,
      }),
    ).rejects.toMatchObject<Partial<PlatformInvitationProviderError>>({
      code: 'PROVIDER_HTTP_503',
      retryable: true,
    });
  });
});
