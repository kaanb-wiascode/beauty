import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  FinancialProviderAdapter,
  ProviderPosRefundRequest,
  ProviderPosRefundResult,
  ProviderPosSettlementBatch,
  ProviderPosSettlementQuery,
  ProviderPosTransaction,
  ProviderPosTransactionLookup,
  ProviderWebhookEvent,
  ProviderWebhookVerificationResult,
} from '../provider-adapter';
import { listIyzicoSftpSettlements } from './iyzico-sftp-settlement';

const PAYMENT_DETAIL_PATH = '/payment/detail';
const REFUND_V2_PATH = '/v2/payment/refund';
const DEFAULT_BASE_URL = 'https://api.iyzipay.com';
const ALLOWED_IYZICO_HOSTS = new Set(['api.iyzipay.com', 'sandbox-api.iyzipay.com']);

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

function numericField(record: Record<string, unknown>, key: string, fallback?: number) {
  const raw = record[key];
  if (raw === undefined || raw === null || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new ServiceUnavailableException(`iyzico payment detail field ${key} is missing.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ServiceUnavailableException(`iyzico payment detail field ${key} is invalid.`);
  }
  return value;
}

function paymentDetailStatus(record: Record<string, unknown>): ProviderPosTransaction['status'] {
  const paymentStatus = typeof record.paymentStatus === 'string' ? record.paymentStatus.toUpperCase() : '';
  if (paymentStatus === 'SUCCESS') return 'CAPTURED';
  if (paymentStatus === 'FAILURE') return 'FAILED';
  if (paymentStatus === 'INIT_THREEDS' || paymentStatus === 'CALLBACK_THREEDS') return 'AUTHORIZED';
  if (Number(record.fraudStatus) === -1) return 'FAILED';
  return 'CAPTURED';
}

function resolveBaseUrl(configured?: string) {
  const parsed = new URL(configured?.trim() || DEFAULT_BASE_URL);
  if (parsed.protocol !== 'https:' || !ALLOWED_IYZICO_HOSTS.has(parsed.hostname)) {
    throw new BadRequestException('iyzico API base URL is not an allowed official endpoint.');
  }
  return parsed.origin;
}

function buildAuthorization(secretKey: string, apiKey: string, path: string, body: string) {
  const randomKey = `${Date.now()}${randomBytes(12).toString('hex')}`;
  const signature = createHmac('sha256', secretKey)
    .update(`${randomKey}${path}${body}`)
    .digest('hex');
  const authorization = Buffer.from(
    `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`,
    'utf8',
  ).toString('base64');
  return { randomKey, authorization };
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
    { key: 'sftpHost', label: 'SFTP Host', secret: false, required: false },
    { key: 'sftpPort', label: 'SFTP Port', secret: false, required: false },
    { key: 'sftpUsername', label: 'SFTP Username', secret: true, required: false },
    { key: 'sftpPassword', label: 'SFTP Password', secret: true, required: false },
  ];
  readonly capabilities = {
    apiCredentials: true,
    posTransactions: true,
    posTransactionEnrichment: true,
    posRefunds: true,
    settlements: true,
    settlementImport: true,
    webhooks: true,
  };

  async listPosSettlements(input: ProviderPosSettlementQuery): Promise<ProviderPosSettlementBatch[]> {
    return listIyzicoSftpSettlements(input.credentials, input.date);
  }

  async refundPosTransaction(input: ProviderPosRefundRequest): Promise<ProviderPosRefundResult> {
    const apiKey = input.credentials.apiKey?.trim();
    const secretKey = input.credentials.secretKey?.trim();
    const paymentId = input.providerTransactionId.trim();
    const conversationId = input.externalEventId.trim();
    const currency = input.currency.trim().toUpperCase();
    if (!apiKey || !secretKey) {
      throw new ServiceUnavailableException('iyzico API credentials are not configured.');
    }
    if (!paymentId) throw new BadRequestException('iyzico paymentId is required for refund.');
    if (!conversationId) throw new BadRequestException('iyzico refund reference is required.');
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('iyzico refund amount must be positive.');
    }
    if (!currency) throw new BadRequestException('iyzico refund currency is required.');

    const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;
    const body = JSON.stringify({
      locale: 'tr',
      conversationId,
      paymentId,
      price: amount,
      currency,
    });
    const { randomKey, authorization } = buildAuthorization(secretKey, apiKey, REFUND_V2_PATH, body);

    let response: Response;
    try {
      response = await fetch(`${resolveBaseUrl(input.credentials.baseUrl)}${REFUND_V2_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `IYZWSv2 ${authorization}`,
          'Content-Type': 'application/json',
          'x-iyzi-rnd': randomKey,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('iyzico refund request failed.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`iyzico refund request returned HTTP ${response.status}.`);
    }

    let result: Record<string, unknown>;
    try {
      result = payloadRecord(await response.json());
    } catch {
      throw new ServiceUnavailableException('iyzico refund response is invalid.');
    }
    if (String(result.status ?? '').toLowerCase() !== 'success') {
      const errorCode = String(result.errorCode ?? '').trim();
      throw new ServiceUnavailableException(
        errorCode ? `iyzico refund request failed (${errorCode}).` : 'iyzico refund request failed.',
      );
    }
    if (String(result.paymentId ?? '').trim() !== paymentId) {
      throw new ServiceUnavailableException('iyzico refund response paymentId does not match the request.');
    }
    if (result.conversationId !== undefined && String(result.conversationId ?? '').trim() !== conversationId) {
      throw new ServiceUnavailableException('iyzico refund response conversationId does not match the request.');
    }
    const returnedAmount = Number(result.price);
    if (!Number.isFinite(returnedAmount) || Math.abs(returnedAmount - amount) > 0.01) {
      throw new ServiceUnavailableException('iyzico refund response amount does not match the request.');
    }
    const returnedCurrency = String(result.currency ?? currency).trim().toUpperCase();
    if (returnedCurrency !== currency) {
      throw new ServiceUnavailableException('iyzico refund response currency does not match the request.');
    }

    return {
      providerTransactionId: paymentId,
      externalEventId: conversationId,
      amount: returnedAmount,
      currency: returnedCurrency,
      occurredAt: new Date(),
      providerReference: String(result.refundHostReference ?? result.hostReference ?? '').trim() || undefined,
    };
  }

  async retrievePosTransaction(input: ProviderPosTransactionLookup): Promise<ProviderPosTransaction> {
    const apiKey = input.credentials.apiKey?.trim();
    const secretKey = input.credentials.secretKey?.trim();
    if (!apiKey || !secretKey) {
      throw new ServiceUnavailableException('iyzico API credentials are not configured.');
    }
    if (!input.occurredAt || Number.isNaN(input.occurredAt.getTime())) {
      throw new ServiceUnavailableException('iyzico transaction occurrence time is unavailable for enrichment.');
    }

    const paymentId = input.providerTransactionId.trim();
    if (!paymentId) throw new BadRequestException('iyzico paymentId is required for enrichment.');

    const body = JSON.stringify({
      locale: 'tr',
      paymentId,
      ...(input.merchantReference ? { paymentConversationId: input.merchantReference } : {}),
    });
    const { randomKey, authorization } = buildAuthorization(secretKey, apiKey, PAYMENT_DETAIL_PATH, body);

    let response: Response;
    try {
      response = await fetch(`${resolveBaseUrl(input.credentials.baseUrl)}${PAYMENT_DETAIL_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `IYZWSv2 ${authorization}`,
          'Content-Type': 'application/json',
          'x-iyzi-rnd': randomKey,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('iyzico payment detail request failed.');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(`iyzico payment detail request returned HTTP ${response.status}.`);
    }

    let detail: Record<string, unknown>;
    try {
      detail = payloadRecord(await response.json());
    } catch {
      throw new ServiceUnavailableException('iyzico payment detail response is invalid.');
    }
    if (String(detail.status ?? '').toLowerCase() !== 'success') {
      const errorCode = typeof detail.errorCode === 'string' ? detail.errorCode.trim() : '';
      throw new ServiceUnavailableException(
        errorCode ? `iyzico payment detail lookup failed (${errorCode}).` : 'iyzico payment detail lookup failed.',
      );
    }

    const returnedPaymentId = String(detail.paymentId ?? '').trim();
    if (!returnedPaymentId || returnedPaymentId !== paymentId) {
      throw new ServiceUnavailableException('iyzico payment detail response paymentId does not match the request.');
    }
    if (input.merchantReference && detail.paymentConversationId !== undefined) {
      const returnedReference = String(detail.paymentConversationId ?? '').trim();
      if (returnedReference !== input.merchantReference) {
        throw new ServiceUnavailableException('iyzico payment detail merchant reference does not match the request.');
      }
    }

    const grossAmount = numericField(detail, 'paidPrice');
    const commissionAmount = numericField(detail, 'iyziCommissionRateAmount', 0);
    const commissionFee = numericField(detail, 'iyziCommissionFee', 0);
    const feeAmount = Math.max(0, commissionAmount + commissionFee);
    const detailCurrency = String(detail.currency ?? '').trim().toUpperCase();
    if (!detailCurrency) throw new ServiceUnavailableException('iyzico payment detail currency is missing.');

    return {
      externalTransactionId: paymentId,
      occurredAt: input.occurredAt,
      grossAmount,
      feeAmount,
      netAmount: Math.max(0, grossAmount - feeAmount),
      currency: detailCurrency,
      status: paymentDetailStatus(detail),
      installmentCount: Math.max(1, Math.trunc(numericField(detail, 'installment', 1))),
    };
  }

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
