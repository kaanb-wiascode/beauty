import { createHmac } from 'node:crypto';
import { IyzicoAdapter } from './providers/iyzico.adapter';
import { PaytrAdapter } from './providers/paytr.adapter';

describe('financial provider webhooks', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies iyzico X-IYZ-SIGNATURE-V3 and exposes correlation without inventing amounts', async () => {
    const adapter = new IyzicoAdapter();
    const credentials = { apiKey: 'api', secretKey: 'secret' };
    const payload = {
      paymentConversationId: 'sale-payment-reference-1',
      merchantId: '123',
      paymentId: '28157248',
      status: 'SUCCESS',
      iyziReferenceCode: 'ref-1',
      iyziEventType: 'API_AUTH',
      iyziEventTime: 1766730778396,
      iyziPaymentId: '28157248',
    };
    const message = `${credentials.secretKey}${payload.iyziEventType}${payload.paymentId}${payload.paymentConversationId}${payload.status}`;
    const signature = createHmac('sha256', credentials.secretKey).update(message).digest('hex');

    await expect(adapter.verifyWebhook({
      headers: { 'x-iyz-signature-v3': signature },
      payload,
      credentials,
    })).resolves.toEqual({ valid: true });

    const parsed = await adapter.parseWebhook({ headers: {}, payload, credentials });
    expect(parsed.externalEventId).toBe('ref-1');
    expect(parsed.transaction).toBeUndefined();
    expect(parsed.correlation).toMatchObject({
      providerTransactionId: '28157248',
      merchantReference: 'sale-payment-reference-1',
      status: 'CAPTURED',
      requiresEnrichment: true,
    });
  });

  it('retrieves iyzico payment detail with IYZWSv2 and maps provider fees without merchant commission', async () => {
    const adapter = new IyzicoAdapter();
    const occurredAt = new Date('2026-09-10T12:00:00.000Z');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        paymentStatus: 'SUCCESS',
        paymentId: '28157248',
        paymentConversationId: 'SALE-77',
        paidPrice: 100,
        merchantCommissionRateAmount: 8,
        iyziCommissionRateAmount: 2.5,
        iyziCommissionFee: 0.25,
        installment: 3,
        currency: 'TRY',
        fraudStatus: 1,
      }),
    } as Response);

    const transaction = await adapter.retrievePosTransaction({
      credentials: {
        apiKey: 'api-key',
        secretKey: 'secret-key',
        baseUrl: 'https://sandbox-api.iyzipay.com',
      },
      providerTransactionId: '28157248',
      merchantReference: 'SALE-77',
      occurredAt,
    });

    expect(transaction).toEqual({
      externalTransactionId: '28157248',
      occurredAt,
      grossAmount: 100,
      feeAmount: 2.75,
      netAmount: 97.25,
      currency: 'TRY',
      status: 'CAPTURED',
      installmentCount: 3,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sandbox-api.iyzipay.com/payment/detail');
    const headers = init?.headers as Record<string, string>;
    const randomKey = headers['x-iyzi-rnd'];
    const body = String(init?.body);
    const expectedSignature = createHmac('sha256', 'secret-key')
      .update(`${randomKey}/payment/detail${body}`)
      .digest('hex');
    const encoded = headers.Authorization.replace('IYZWSv2 ', '');
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(
      `apiKey:api-key&randomKey:${randomKey}&signature:${expectedSignature}`,
    );
    expect(JSON.parse(body)).toEqual({
      locale: 'tr',
      paymentId: '28157248',
      paymentConversationId: 'SALE-77',
    });
  });

  it('rejects mismatched iyzico payment detail correlation', async () => {
    const adapter = new IyzicoAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        paymentId: 'different-payment',
        paidPrice: 100,
        currency: 'TRY',
      }),
    } as Response);

    await expect(adapter.retrievePosTransaction({
      credentials: { apiKey: 'api', secretKey: 'secret' },
      providerTransactionId: 'expected-payment',
      occurredAt: new Date('2026-09-10T12:00:00.000Z'),
    })).rejects.toThrow('paymentId does not match');
  });

  it('verifies PayTR Direct/iFrame callback hash and parses minor-unit payment amount', async () => {
    const adapter = new PaytrAdapter();
    const credentials = { merchantId: '123456', merchantKey: 'key', merchantSalt: 'salt' };
    const payload = {
      merchant_oid: 'order-42',
      status: 'success',
      total_amount: '10500',
      payment_amount: '10000',
      payment_type: 'card',
      currency: 'TL',
    };
    const message = `${payload.merchant_oid}${credentials.merchantSalt}${payload.status}${payload.total_amount}`;
    const hash = createHmac('sha256', credentials.merchantKey).update(message).digest('base64');
    const signedPayload = { ...payload, hash };

    await expect(adapter.verifyWebhook({ headers: {}, payload: signedPayload, credentials }))
      .resolves.toEqual({ valid: true });

    const parsed = await adapter.parseWebhook({ headers: {}, payload: signedPayload, credentials });
    expect(parsed.transaction).toMatchObject({
      externalTransactionId: 'order-42',
      grossAmount: 100,
      netAmount: 100,
      currency: 'TRY',
      status: 'CAPTURED',
    });
  });

  it('rejects altered provider webhook signatures', async () => {
    const iyzico = new IyzicoAdapter();
    const payload = {
      paymentConversationId: 'ref',
      paymentId: '1',
      status: 'SUCCESS',
      iyziEventType: 'API_AUTH',
    };
    await expect(iyzico.verifyWebhook({
      headers: { 'x-iyz-signature-v3': 'deadbeef' },
      payload,
      credentials: { secretKey: 'secret' },
    })).resolves.toEqual({ valid: false });
  });
});
