import { createHmac } from 'node:crypto';
import { IyzicoAdapter } from './iyzico.adapter';
import { PaytrAdapter } from './paytr.adapter';

describe('financial provider webhook adapters', () => {
  it('verifies and parses PayTR callbacks with the documented HMAC payload', async () => {
    const adapter = new PaytrAdapter();
    const credentials = {
      merchantId: 'merchant-1',
      merchantKey: 'merchant-key',
      merchantSalt: 'merchant-salt',
    };
    const payload = {
      merchant_oid: 'SALE-42',
      status: 'success',
      total_amount: '10500',
      payment_amount: '10000',
      payment_type: 'card',
      currency: 'TL',
      hash: '',
    };
    payload.hash = createHmac('sha256', credentials.merchantKey)
      .update(`${payload.merchant_oid}${credentials.merchantSalt}${payload.status}${payload.total_amount}`)
      .digest('base64');

    await expect(adapter.verifyWebhook({ headers: {}, payload, credentials })).resolves.toEqual({ valid: true });
    const parsed = await adapter.parseWebhook({ headers: {}, payload, credentials });
    expect(parsed.externalEventId).toBe('SALE-42');
    expect(parsed.transaction).toMatchObject({
      externalTransactionId: 'SALE-42',
      status: 'CAPTURED',
      grossAmount: 100,
      netAmount: 100,
      currency: 'TRY',
    });

    await expect(adapter.verifyWebhook({
      headers: {},
      payload: { ...payload, hash: 'invalid' },
      credentials,
    })).resolves.toEqual({ valid: false });
  });

  it('verifies iyzico direct webhooks with X-IYZ-SIGNATURE-V3', async () => {
    const adapter = new IyzicoAdapter();
    const credentials = {
      apiKey: 'api-key',
      secretKey: 'secret-key',
    };
    const payload = {
      paymentConversationId: 'SALE-77',
      merchantId: 3404590,
      paymentId: 28157248,
      status: 'SUCCESS',
      iyziReferenceCode: 'ref-77',
      iyziEventType: 'API_AUTH',
      iyziEventTime: 1766730778396,
      iyziPaymentId: 28157248,
    };
    const message = `${credentials.secretKey}${payload.iyziEventType}${payload.paymentId}${payload.paymentConversationId}${payload.status}`;
    const signature = createHmac('sha256', credentials.secretKey).update(message).digest('hex');
    const invalidSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;

    await expect(adapter.verifyWebhook({
      headers: { 'x-iyz-signature-v3': signature },
      payload,
      credentials,
    })).resolves.toEqual({ valid: true });
    await expect(adapter.verifyWebhook({
      headers: { 'x-iyz-signature-v3': invalidSignature },
      payload,
      credentials,
    })).resolves.toEqual({ valid: false });

    const parsed = await adapter.parseWebhook({ headers: {}, payload, credentials });
    expect(parsed).toEqual({
      externalEventId: 'ref-77',
      eventType: 'PAYMENT_SUCCESS',
      correlation: {
        providerTransactionId: '28157248',
        merchantReference: 'SALE-77',
        status: 'CAPTURED',
        occurredAt: new Date(1766730778396),
        requiresEnrichment: true,
      },
    });
  });

  it('verifies iyzico HPP webhooks with the HPP V3 signature order', async () => {
    const adapter = new IyzicoAdapter();
    const credentials = { apiKey: 'api-key', secretKey: 'secret-key' };
    const payload = {
      paymentConversationId: 'SALE-88',
      merchantId: 3404590,
      status: 'SUCCESS',
      token: 'hpp-token',
      iyziReferenceCode: 'ref-88',
      iyziEventType: 'CHECKOUT_FORM_AUTH',
      iyziEventTime: 1766733201159,
      iyziPaymentId: 28157797,
    };
    const message = `${credentials.secretKey}${payload.iyziEventType}${payload.iyziPaymentId}${payload.token}${payload.paymentConversationId}${payload.status}`;
    const signature = createHmac('sha256', credentials.secretKey).update(message).digest('hex');

    await expect(adapter.verifyWebhook({
      headers: { 'X-IYZ-SIGNATURE-V3': signature },
      payload,
      credentials,
    })).resolves.toEqual({ valid: true });
  });
});
