import { createHmac } from 'node:crypto';
import { IyzicoAdapter } from './iyzico.adapter';

describe('IyzicoAdapter refund runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs and maps refund v2 responses', async () => {
    const adapter = new IyzicoAdapter();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        paymentId: '28157248',
        conversationId: 'refund-42',
        price: 25.5,
        currency: 'TRY',
        refundHostReference: 'host-ref-1',
      }),
    } as Response);

    const result = await adapter.refundPosTransaction({
      credentials: {
        apiKey: 'test-api',
        secretKey: 'test-secret',
        baseUrl: 'https://sandbox-api.iyzipay.com',
      },
      providerTransactionId: '28157248',
      amount: 25.5,
      currency: 'TRY',
      externalEventId: 'refund-42',
    });

    expect(result).toMatchObject({
      providerTransactionId: '28157248',
      externalEventId: 'refund-42',
      amount: 25.5,
      currency: 'TRY',
      providerReference: 'host-ref-1',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sandbox-api.iyzipay.com/v2/payment/refund');
    expect(init?.method).toBe('POST');
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({
      locale: 'tr',
      conversationId: 'refund-42',
      paymentId: '28157248',
      price: 25.5,
      currency: 'TRY',
    });

    const headers = init?.headers as Record<string, string>;
    const randomKey = headers['x-iyzi-rnd'];
    const encoded = headers.Authorization.replace('IYZWSv2 ', '');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const expectedSignature = createHmac('sha256', 'test-secret')
      .update(`${randomKey}/v2/payment/refund${body}`)
      .digest('hex');
    expect(decoded).toBe(`apiKey:test-api&randomKey:${randomKey}&signature:${expectedSignature}`);
  });

  it('rejects mismatched iyzico refund payment references', async () => {
    const adapter = new IyzicoAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        paymentId: 'unexpected-payment',
        conversationId: 'refund-42',
        price: 25.5,
        currency: 'TRY',
      }),
    } as Response);

    await expect(adapter.refundPosTransaction({
      credentials: { apiKey: 'test-api', secretKey: 'test-secret' },
      providerTransactionId: '28157248',
      amount: 25.5,
      currency: 'TRY',
      externalEventId: 'refund-42',
    })).rejects.toThrow('paymentId does not match');
  });
});
