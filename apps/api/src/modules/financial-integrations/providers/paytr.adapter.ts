import { createHmac, timingSafeEqual } from 'node:crypto';
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

const STATUS_QUERY_URL = 'https://www.paytr.com/odeme/durum-sorgu';
const REFUND_URL = 'https://www.paytr.com/odeme/iade';
const PAYMENT_DETAIL_URL = 'https://www.paytr.com/rapor/odeme-detayi';

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

function formatReportDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BadRequestException('PayTR settlement report date is invalid.');
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(value);
}

function settlementRows(payload: Record<string, unknown>) {
  const direct = Object.values(payload).find((value) =>
    Array.isArray(value) && value.some((item) => item && typeof item === 'object' && !Array.isArray(item) && 'merchant_oid' in item),
  );
  if (Array.isArray(direct)) return direct as Record<string, unknown>[];
  if (payload.merchant_oid !== undefined) return [payload];
  return [];
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
    posRefunds: true,
    settlements: true,
    settlementImport: true,
    webhooks: true,
  };

  async listPosSettlements(input: ProviderPosSettlementQuery): Promise<ProviderPosSettlementBatch[]> {
    const merchantId = input.credentials.merchantId?.trim();
    const merchantKey = input.credentials.merchantKey?.trim();
    const merchantSalt = input.credentials.merchantSalt?.trim();
    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new ServiceUnavailableException('PayTR API credentials are not configured.');
    }
    const date = formatReportDate(input.date);
    const paytrToken = createHmac('sha256', merchantKey)
      .update(`${merchantId}${date}${merchantSalt}`)
      .digest('base64');
    const body = new URLSearchParams({ merchant_id: merchantId, date, paytr_token: paytrToken });

    let response: Response;
    try {
      response = await fetch(PAYMENT_DETAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('PayTR settlement report request failed.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`PayTR settlement report returned HTTP ${response.status}.`);
    }

    let result: Record<string, unknown>;
    try {
      result = payloadRecord(await response.json());
    } catch {
      throw new ServiceUnavailableException('PayTR settlement report response is invalid.');
    }
    const status = String(result.status ?? '').toLowerCase();
    if (status === 'failed') return [];
    if (status !== 'success') {
      throw new ServiceUnavailableException('PayTR settlement report request was rejected.');
    }

    const groups = new Map<string, string[]>();
    for (const row of settlementRows(result)) {
      const providerTransactionId = String(row.merchant_oid ?? '').trim();
      if (!providerTransactionId) continue;
      const currency = normalizeCurrency(row.currency);
      const key = `${date}:${currency}`;
      const ids = groups.get(key) ?? [];
      if (!ids.includes(providerTransactionId)) ids.push(providerTransactionId);
      groups.set(key, ids);
    }

    const settledAt = new Date(`${date}T23:59:59+03:00`);
    return Array.from(groups.entries()).map(([key, providerTransactionIds]) => {
      const currency = key.slice(key.lastIndexOf(':') + 1);
      return {
        providerSettlementId: `PAYTR:${date}:${currency}`,
        settledAt,
        currency,
        providerTransactionIds,
      };
    });
  }

  async refundPosTransaction(input: ProviderPosRefundRequest): Promise<ProviderPosRefundResult> {
    const merchantId = input.credentials.merchantId?.trim();
    const merchantKey = input.credentials.merchantKey?.trim();
    const merchantSalt = input.credentials.merchantSalt?.trim();
    const merchantOid = input.providerTransactionId.trim();
    const referenceNo = input.externalEventId.trim();
    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new ServiceUnavailableException('PayTR API credentials are not configured.');
    }
    if (!merchantOid) throw new BadRequestException('PayTR merchant_oid is required for refund.');
    if (!referenceNo) throw new BadRequestException('PayTR refund reference is required.');
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('PayTR refund amount must be positive.');
    }

    const returnAmount = input.amount.toFixed(2);
    const paytrToken = createHmac('sha256', merchantKey)
      .update(`${merchantId}${merchantOid}${returnAmount}${merchantSalt}`)
      .digest('base64');
    const body = new URLSearchParams({
      merchant_id: merchantId,
      merchant_oid: merchantOid,
      return_amount: returnAmount,
      paytr_token: paytrToken,
      reference_no: referenceNo.slice(0, 64),
    });

    let response: Response;
    try {
      response = await fetch(REFUND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('PayTR refund request failed.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(`PayTR refund request returned HTTP ${response.status}.`);
    }

    let result: Record<string, unknown>;
    try {
      result = payloadRecord(await response.json());
    } catch {
      throw new ServiceUnavailableException('PayTR refund response is invalid.');
    }
    if (String(result.status ?? '').toLowerCase() !== 'success') {
      throw new ServiceUnavailableException('PayTR refund request was rejected.');
    }
    const returnedOid = String(result.merchant_oid ?? '').trim();
    if (returnedOid && returnedOid !== merchantOid) {
      throw new ServiceUnavailableException('PayTR refund response merchant_oid does not match the request.');
    }
    const returnedAmount = Number(String(result.return_amount ?? returnAmount).replace(',', '.'));
    if (!Number.isFinite(returnedAmount) || Math.abs(returnedAmount - input.amount) > 0.01) {
      throw new ServiceUnavailableException('PayTR refund response amount does not match the request.');
    }

    return {
      providerTransactionId: merchantOid,
      externalEventId: referenceNo,
      amount: returnedAmount,
      currency: input.currency.toUpperCase(),
      occurredAt: new Date(),
      providerReference: String(result.reference_no ?? referenceNo).trim() || referenceNo,
    };
  }

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
    const body = new URLSearchParams({ merchant_id: merchantId, merchant_oid: merchantOid, paytr_token: paytrToken });

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
    if (!response.ok) throw new ServiceUnavailableException(`PayTR status query returned HTTP ${response.status}.`);

    let detail: Record<string, unknown>;
    try { detail = payloadRecord(await response.json()); } catch { throw new ServiceUnavailableException('PayTR status query response is invalid.'); }
    if (String(detail.status ?? '').toLowerCase() !== 'success') {
      const errorNo = String(detail.err_no ?? '').trim();
      throw new ServiceUnavailableException(errorNo ? `PayTR status query failed (${errorNo}).` : 'PayTR status query failed.');
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

  async verifyWebhook(input: { headers: Record<string, string | string[] | undefined>; payload: unknown; credentials: Record<string, string> }): Promise<ProviderWebhookVerificationResult> {
    const payload = payloadRecord(input.payload);
    const merchantOid = requiredString(payload, 'merchant_oid');
    const status = requiredString(payload, 'status');
    const totalAmount = requiredString(payload, 'total_amount');
    const receivedHash = requiredString(payload, 'hash');
    const merchantKey = input.credentials.merchantKey;
    const merchantSalt = input.credentials.merchantSalt;
    if (!merchantKey || !merchantSalt) return { valid: false };
    const expectedHash = createHmac('sha256', merchantKey).update(`${merchantOid}${merchantSalt}${status}${totalAmount}`).digest('base64');
    return { valid: secureEqual(expectedHash, receivedHash) };
  }

  async parseWebhook(input: { headers: Record<string, string | string[] | undefined>; payload: unknown; credentials: Record<string, string> }): Promise<ProviderWebhookEvent> {
    const payload = payloadRecord(input.payload);
    const merchantOid = requiredString(payload, 'merchant_oid');
    const status = requiredString(payload, 'status').toLowerCase();
    const paymentType = requiredString(payload, 'payment_type').toLowerCase();
    if (paymentType !== 'card') throw new BadRequestException('PayTR callback is not a card payment.');
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
