import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export class PlatformInvitationProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

export type PlatformOwnerInvitationDispatchRequest = {
  deliveryId: string;
  provisioningRunId: string;
  tenantId: string;
  companyId: string;
  email: string;
  invitationToken: string;
  expiresAt: string;
  acceptApiUrl: string | null;
};

@Injectable()
export class PlatformOwnerInvitationWebhookProvider {
  readonly key = 'SIGNED_WEBHOOK';

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_URL') &&
        this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_SECRET'),
    );
  }

  async send(request: PlatformOwnerInvitationDispatchRequest) {
    const url = this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_URL');
    const secret = this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_SECRET');
    const timeoutMs =
      this.config.get<number>('PLATFORM_INVITATION_WEBHOOK_TIMEOUT_MS') ?? 5000;

    if (!url || !secret) {
      throw new PlatformInvitationProviderError('PROVIDER_NOT_CONFIGURED', true);
    }

    const body = JSON.stringify({
      event: 'PLATFORM_OWNER_INVITATION',
      ...request,
    });
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-valoo-platform-timestamp': timestamp,
          'x-valoo-platform-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new PlatformInvitationProviderError('PROVIDER_NETWORK_ERROR', true);
    }

    if (!response.ok) {
      const retryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      throw new PlatformInvitationProviderError(
        `PROVIDER_HTTP_${response.status}`,
        retryable,
      );
    }

    let providerMessageId: string | null = null;
    try {
      const payload = (await response.json()) as { messageId?: unknown };
      if (typeof payload.messageId === 'string' && payload.messageId.trim()) {
        providerMessageId = payload.messageId.trim().slice(0, 200);
      }
    } catch {
      providerMessageId =
        response.headers.get('x-provider-message-id')?.slice(0, 200) ?? null;
    }

    return { providerMessageId };
  }
}
