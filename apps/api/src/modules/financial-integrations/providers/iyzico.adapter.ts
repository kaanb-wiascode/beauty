import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  FinancialProviderAdapter,
  ProviderWebhookEvent,
  ProviderWebhookVerificationResult,
} from '../provider-adapter';

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('iyzico webhook payload must be an object.');
  }
  return payload as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`iyzico webhook field ${key} is required.`);
  }
  const normalized = String(value).trim();
  if (!normalized) throw new BadRequestException(`iyzico webhook field ${key} is required.`);
  return normalized;
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function secureHexEqual(left: string, right: string) {
  const a = Buffer.from(left.toLowerCase(), 'utf8');
  const b = Buffer.from(right.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapStatus(status: string) {
  if (status === 'SUCCESS') return 'CAPTURED' as const;
  if (status === 'FAILURE') return 'FAILED' as const;
  return 'AUTHORIZED' as const;
}

@Injectable()
export class IyzicoAdapter implements FinancialProviderAdapter {
  readonly provider = 'IYZICO';
  readonly displayName = 'iyzico';
  readonly kind = 'VIRTUAL_POS' as const;
  readonly runtimeReady = false;
  readonly credentialFields = [
    { key: 'apiKey', label: 'API Key', secret: true, required: true },
    { key: 'secretKey', label: 'Secret Key', secret: true, required: true },
    { key: 'merchantId', label: 'Merchant ID', secret: false, required: false },
    { key: 'baseUrl', label: 'API Base URL', secret: false, required: false },
  ];
  readonly capabilities = {
    apiCredentials: true,
    posTransactions: true,
    settlements: true,
    webhooks: true,
  };

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookVerificationResult> {
    const payload = payloadRecord(input.payload);
    const signature = getHeader(input.headers, 'x-iyz-signature-v3');
    const secretKey = input.credentials.secretKey;
    if (!signature || !secretKey) return { valid: false };

    const eventType = requiredString(payload, 'iyziEventType');
    const paymentConversationId = requiredString(payload, 'paymentConversationId');
    const status = requiredString(payload, 'status');
    const token = typeof payload.token === 'string' ? payload.token.trim() : '';
    const paymentId = token
      ? requiredString(payload, 'iyziPaymentId')
      : requiredString(payload, 'paymentId');
    const message = token
      ? `${secretKey}${eventType}${paymentId}${token}${paymentConversationId}${status}`
      : `${secretKey}${eventType}${paymentId}${paymentConversationId}${status}`;
    const expected = createHmac('sha256', secretKey).update(message).digest('hex');
    return { valid: secureHexEqual(expected, signature.trim()) };
  }

  async parseWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookEvent> {
    const payload = payloadRecord(input.payload);
    const eventType = requiredString(payload, 'iyziEventType');
    const status = requiredString(payload, 'status').toUpperCase();
    const paymentConversationId = requiredString(payload, 'paymentConversationId');
    const paymentId = typeof payload.paymentId === 'string' || typeof payload.paymentId === 'number'
      ? String(payload.paymentId)
      : requiredString(payload, 'iyziPaymentId');
    const referenceCode = typeof payload.iyziReferenceCode === 'string' ? payload.iyziReferenceCode.trim() : '';
    const eventTime = Number(payload.iyziEventTime ?? Date.now());
    const occurredAt = Number.isFinite(eventTime) ? new Date(eventTime) : new Date();

    return {
      externalEventId: referenceCode || `${eventType}:${paymentId}:${eventTime}`,
      eventType: status === 'SUCCESS' ? 'PAYMENT_SUCCESS' : status === 'FAILURE' ? 'PAYMENT_FAILED' : 'PAYMENT_STATUS',
      correlation: {
        providerTransactionId: paymentId,
        merchantReference: paymentConversationId,
        occurredAt,
        status: mapStatus(status),
        requiresEnrichment: true,
      },
    };
  }
}
