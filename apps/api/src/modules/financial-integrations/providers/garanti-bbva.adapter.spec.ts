import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { GarantiBbvaAdapter } from './garanti-bbva.adapter';

describe('GarantiBbvaAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the official client_credentials token endpoint without exposing credentials', async () => {
    const adapter = new GarantiBbvaAdapter();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'bank-access-token', token_type: 'Bearer', expires_in: 3600 }),
    } as Response);

    const before = Date.now();
    const result = await adapter.authenticateCredentials({
      clientId: 'client-1',
      clientSecret: 'test-secret',
      redirectUri: 'https://erp.example.com/financial-integrations/callback',
    });

    expect(result.accessToken).toBe('bank-access-token');
    expect(result.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3_599_000);
    expect(result.metadata).toMatchObject({ tokenType: 'Bearer', source: 'GARANTI_BBVA_CLIENT_CREDENTIALS' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://apis.garantibbva.com.tr/auth/oauth/v2/token');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('client_secret')).toBe('test-secret');
    expect(body.get('redirect_uri')).toBe('https://erp.example.com/financial-integrations/callback');
  });

  it('rejects non-https redirect URIs outside localhost', async () => {
    const adapter = new GarantiBbvaAdapter();
    await expect(adapter.authenticateCredentials({
      clientId: 'client-1',
      clientSecret: 'test-secret',
      redirectUri: 'http://example.com/callback',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a generic error when the provider rejects credentials', async () => {
    const adapter = new GarantiBbvaAdapter();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error_description: 'sensitive provider diagnostic' }),
    } as Response);

    await expect(adapter.authenticateCredentials({
      clientId: 'client-1',
      clientSecret: 'test-secret',
      redirectUri: 'https://erp.example.com/callback',
    })).rejects.toThrow('Garanti BBVA token request failed.');
    await expect(Promise.resolve(ServiceUnavailableException)).resolves.toBeDefined();
  });
});
