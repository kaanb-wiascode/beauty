import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  FinancialProviderAdapter,
  ProviderPosTransaction,
  ProviderPosTransactionLookup,
  ProviderWebhookEvent,
  ProviderWebhookVerificationResult,
} from '../provider-adapter';

const STATUS_QUERY_URL = 'https://www.paytr.com/odeme/durum-sorgu';

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('PayTR callback payload must be an object.');
  }
  return payload as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`PayTR callback field ${key} is required.`);
  }
  const normalized = String(value).trim();
  if (!normalized) throw new BadRequestException(`PayTR callback field ${key} is required.`);
  return normalized;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function numericDetailField(record: Record<string, unknown>, key: string) {
  const raw = record[key];
  const normalized = typeof raw === 'string' ? raw.replace(',', '.').trim() : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    throw new ServiceUnavailableException(`PayTR status query field ${key} is invalid.`);
  }
  return value;
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? '').trim().toUpperCase();
  if (!currency) throw new ServiceUnavailableException('PayTR status query currency is missing.');
  return currency === 'TL' ? 'TRY' : currency;
}

function parsePaymentDate(value: unknown, fallback?: Date) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (match) {
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+03:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (fallback && !Number.isNaN(fallback.getTime())) return fallback;
  throw new ServiceUnavailableException('PayTR status query payment date is invalid.');
}

@Injectable()
export class PaytrAdapter implements FinancialProviderAdapter {
  readonly provider = 'PAYTR';
  readonly displayName = 'PayTR';
  readonly kind = 'VIRTUAL_POS' as const;
  readonly runtimeReady = false;
  readonly credentialFields = [
    { key: 'merchantId', label: 'Merchant ID', secret: false, required: true },
    { key: 'merchantKey', label: 'Merchant Key', secret: true, required: true },
    { key: 'merchantSalt', label: 'Merchant Salt', secret: true, required: true },
  ];
  readonly capabilities = {
    apiCredentials: true,
    posTransactions: true,
    posTransactionEnrichment: true,
    settlements: true,
    webhooks: true,
  };

  async retrievePosTransaction(input: ProviderPosTransactionLookup): Promise<ProviderPosTransaction> {
    const merchantId = input.credentials.merchantId?.trim();
    const merchantKey = input.credentials.merchantKey?.trim();
    const merchantSalt = input.credentials.merchantSalt?.trim();
    const merchantOid = input.providerTransactionId.trim();
    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new ServiceUnavailableException('PayTR API credentials are not configured.');
    }
    if (!merchantOid) throw new BadRequestException('PayTR merchant_oid is required for enrichment.');

    const paytrToken = createHmac('sha256', merchantKey)
      .update(`${merchantId}${merchantOid}${merchantSalt}`)
      .digest('base64');
    const body = new URLSearchParams({
      merchant_id: merchantId,
      merchant_oid: merchantOid,
      paytr_token: paytrToken,
    });

    let response: Response;
    try {
      response = await fetch(STATUS_QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('PayTR status query request failed.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`PayTR status query returned HTTP ${response.status}.`);
    }

    let detail: Record<string, unknown>;
    try {
      detail = payloadRecord(await response.json());
    } catch {
      throw new ServiceUnavailableException('PayTR status query response is invalid.');
    }
    if (String(detail.status ?? '').toLowerCase() !== 'success') {
      const errorNo = String(detail.err_no ?? '').trim();
      throw new ServiceUnavailableException(
        errorNo ? `PayTR status query failed (${errorNo}).` : 'PayTR status query failed.',
      );
    }

    const grossAmount = numericDetailField(detail, 'payment_amount');
    const feeAmount = numericDetailField(detail, 'kesinti_tutari');
    const netAmount = numericDetailField(detail, 'net_tutar');
    const installmentRaw = numericDetailField(detail, 'taksit');

    return {
      externalTransactionId: merchantOid,
      merchantId,
      occurredAt: parsePaymentDate(detail.payment_date, input.occurredAt),
      grossAmount,
      feeAmount,
      netAmount,
      currency: normalizeCurrency(detail.currency),
      status: 'CAPTURED',
      installmentCount: Math.max(1, Math.trunc(installmentRaw || 1)),
    };
  }

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookVerificationResult> {
    const payload = payloadRecord(input.payload);
    const merchantOid = requiredString(payload, 'merchant_oid');
    const status = requiredString(payload, 'status');
    const totalAmount = requiredString(payload, 'total_amount');
    const receivedHash = requiredString(payload, 'hash');
    const merchantKey = input.credentials.merchantKey;
    const merchantSalt = input.credentials.merchantSalt;
    if (!merchantKey || !merchantSalt) return { valid: false };

    const message = `${merchantOid}${merchantSalt}${status}${totalAmount}`;
    const expectedHash = createHmac('sha256', merchantKey).update(message).digest('base64');
    return { valid: secureEqual(expectedHash, receivedHash) };
  }

  async parseWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    payload: unknown;
    credentials: Record<string, string>;
  }): Promise<ProviderWebhookEvent> {
    const payload = payloadRecord(input.payload);
    const merchantOid = requiredString(payload, 'merchant_oid');
    const status = requiredString(payload, 'status').toLowerCase();
    const paymentType = requiredString(payload, 'payment_type').toLowerCase();
    if (paymentType !== 'card') {
      throw new BadRequestException('PayTR callback is not a card payment.');
    }

    const totalAmountMinor = Number(requiredString(payload, 'total_amount'));
    const paymentAmountMinor = Number(payload.payment_amount ?? totalAmountMinor);
    if (!Number.isFinite(totalAmountMinor) || totalAmountMinor < 0 || !Number.isFinite(paymentAmountMinor) || paymentAmountMinor < 0) {
      throw new BadRequestException('PayTR callback amount is invalid.');
    }

    return {
      externalEventId: `${merchantOid}:${status}:${totalAmountMinor}`,
      eventType: status === 'success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
      correlation: {
        providerTransactionId: merchantOid,
        merchantReference: merchantOid,
        occurredAt: new Date(),
        status: status === 'success' ? 'CAPTURED' : 'FAILED',
        requiresEnrichment: status === 'success',
      },
    };
  }
}
