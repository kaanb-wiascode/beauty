import { createHmac } from 'node:crypto';
import { PaytrAdapter } from './paytr.adapter';

describe('PayTR refund runtime', () => {
  afterEach(() => jest.restoreAllMocks());

  it('signs and maps a provider refund without inventing fees', async () => {
    const adapter = new PaytrAdapter();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        merchant_oid: 'order-42',
        return_amount: '25.50',
        reference_no: 'refund-42',
      }),
    } as Response);
    const credentials = { merchantId: 'm-1', merchantKey: 'k-1', merchantSalt: 's-1' };

    const result = await adapter.refundPosTransaction({
      credentials,
      providerTransactionId: 'order-42',
      merchantReference: 'order-42',
      amount: 25.5,
      currency: 'TRY',
      externalEventId: 'refund-42',
    });

    expect(result).toMatchObject({
      providerTransactionId: 'order-42',
      externalEventId: 'refund-42',
      amount: 25.5,
      currency: 'TRY',
      providerReference: 'refund-42',
    });
    expect(result.occurredAt).toBeInstanceOf(Date);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://www.paytr.com/odeme/iade');
    const body = init?.body as URLSearchParams;
    expect(body.get('return_amount')).toBe('25.50');
    expect(body.get('paytr_token')).toBe(
      createHmac('sha256', credentials.merchantKey)
        .update(`${credentials.merchantId}order-4225.50${credentials.merchantSalt}`)
        .digest('base64'),
    );
  });

  it('rejects a mismatched provider refund response', async () => {
    const adapter = new PaytrAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', merchant_oid: 'different-order', return_amount: '25.50' }),
    } as Response);

    await expect(adapter.refundPosTransaction({
      credentials: { merchantId: 'm-1', merchantKey: 'k-1', merchantSalt: 's-1' },
      providerTransactionId: 'order-42',
      amount: 25.5,
      currency: 'TRY',
      externalEventId: 'refund-42',
    })).rejects.toThrow('merchant_oid does not match');
  });
});
