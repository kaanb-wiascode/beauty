import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  QualityNotificationChannel,
  QualityNotificationDispatchRequest,
  QualityNotificationDispatchResult,
  QualityNotificationProvider,
  QualityNotificationProviderError,
} from './quality-notification-provider';

@Injectable()
export class QualityNotificationWebhookProvider implements QualityNotificationProvider {
  readonly key = 'SIGNED_WEBHOOK';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('QUALITY_NOTIFICATION_WEBHOOK_URL') &&
        this.config.get<string>('QUALITY_NOTIFICATION_WEBHOOK_SECRET'),
    );
  }

  supports(channel: QualityNotificationChannel): boolean {
    return channel === 'EMAIL';
  }

  async send(
    request: QualityNotificationDispatchRequest,
  ): Promise<QualityNotificationDispatchResult> {
    const url = this.config.get<string>('QUALITY_NOTIFICATION_WEBHOOK_URL');
    const secret = this.config.get<string>('QUALITY_NOTIFICATION_WEBHOOK_SECRET');
    const timeoutMs = this.config.get<number>('QUALITY_NOTIFICATION_WEBHOOK_TIMEOUT_MS') ?? 5000;

    if (!url || !secret) {
      throw new QualityNotificationProviderError('PROVIDER_NOT_CONFIGURED', true);
    }

    const body = JSON.stringify(request);
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
          'x-valoo-timestamp': timestamp,
          'x-valoo-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new QualityNotificationProviderError('PROVIDER_NETWORK_ERROR', true);
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new QualityNotificationProviderError(
        `PROVIDER_HTTP_${response.status}`,
        retryable,
      );
    }

    let providerMessageId: string | null = null;
    try {
      const payload = (await response.json()) as { messageId?: unknown };
      if (typeof payload?.messageId === 'string' && payload.messageId.trim()) {
        providerMessageId = payload.messageId.trim().slice(0, 200);
      }
    } catch {
      providerMessageId = response.headers.get('x-provider-message-id')?.slice(0, 200) ?? null;
    }

    return { providerMessageId };
  }
}
