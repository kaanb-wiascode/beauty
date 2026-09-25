import { createHmac } from 'node:crypto';
import { PaytrAdapter } from './paytr.adapter';

describe('PaytrAdapter settlement import', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs the official payment-detail report request and groups transactions by currency', async () => {
    const adapter = new PaytrAdapter();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        details: [
          { merchant_oid: 'order-1', payment: '97.50', currency: 'TL' },
          { merchant_oid: 'order-2', payment: '49.00', currency: 'TRY' },
          { merchant_oid: 'order-usd', payment: '20.00', currency: 'USD' },
        ],
      }),
    } as Response);

    const result = await adapter.listPosSettlements({
      credentials: {
        merchantId: 'merchant-1',
        merchantKey: 'test-key',
        merchantSalt: 'test-salt',
      },
      date: new Date('2026-09-10T12:00:00.000Z'),
    });

    expect(result).toEqual([
      {
        providerSettlementId: 'PAYTR:2026-09-10:TRY',
        settledAt: new Date('2026-09-10T20:59:59.000Z'),
        currency: 'TRY',
        providerTransactionIds: ['order-1', 'order-2'],
      },
      {
        providerSettlementId: 'PAYTR:2026-09-10:USD',
        settledAt: new Date('2026-09-10T20:59:59.000Z'),
        currency: 'USD',
        providerTransactionIds: ['order-usd'],
      },
    ]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://www.paytr.com/rapor/odeme-detayi');
    expect(init?.method).toBe('POST');
    const body = init?.body as URLSearchParams;
    expect(body.get('merchant_id')).toBe('merchant-1');
    expect(body.get('date')).toBe('2026-09-10');
    expect(body.get('paytr_token')).toBe(
      createHmac('sha256', 'test-key')
        .update('merchant-12026-09-10test-salt')
        .digest('base64'),
    );
  });

  it('treats the official failed status as an empty settlement day', async () => {
    const adapter = new PaytrAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'failed' }),
    } as Response);

    await expect(adapter.listPosSettlements({
      credentials: { merchantId: 'm', merchantKey: 'k', merchantSalt: 's' },
      date: new Date('2026-09-09T12:00:00.000Z'),
    })).resolves.toEqual([]);
  });

  it('does not fabricate settlement rows when a success response has no documented merchant_oid rows', async () => {
    const adapter = new PaytrAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', unknown: [] }),
    } as Response);

    await expect(adapter.listPosSettlements({
      credentials: { merchantId: 'm', merchantKey: 'k', merchantSalt: 's' },
      date: new Date('2026-09-09T12:00:00.000Z'),
    })).resolves.toEqual([]);
  });
});
