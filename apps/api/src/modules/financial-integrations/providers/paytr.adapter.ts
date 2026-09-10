import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  FinancialProviderAdapter,
  ProviderWebhookEvent,
  ProviderWebhookVerificationResult,
} from '../provider-adapter';

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
    settlements: true,
    webhooks: true,
  };

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
    const currencyValue = requiredString(payload, 'currency').toUpperCase();
    const currency = currencyValue === 'TL' ? 'TRY' : currencyValue;
    const amount = Math.round(paymentAmountMinor) / 100;

    return {
      externalEventId: merchantOid,
      eventType: status === 'success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
      transaction: {
        externalTransactionId: merchantOid,
        merchantId: input.credentials.merchantId,
        occurredAt: new Date(),
        grossAmount: amount,
        feeAmount: 0,
        netAmount: amount,
        currency,
        status: status === 'success' ? 'CAPTURED' : 'FAILED',
        installmentCount: 1,
      },
    };
  }
}
