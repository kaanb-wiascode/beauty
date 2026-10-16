import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { FinancialProviderAdapter, ProviderTokenSet } from '../provider-adapter';

const TOKEN_URL = 'https://apis.garantibbva.com.tr/auth/oauth/v2/token';

@Injectable()
export class GarantiBbvaAdapter implements FinancialProviderAdapter {
  readonly provider = 'GARANTI_BBVA';
  readonly displayName = 'Garanti BBVA API Store';
  readonly kind = 'OPEN_BANKING' as const;
  readonly runtimeReady = false;
  readonly credentialFields = [
    { key: 'clientId', label: 'Client ID', secret: false, required: true },
    { key: 'clientSecret', label: 'Client Secret', secret: true, required: true },
    { key: 'redirectUri', label: 'Callback URL', secret: false, required: true },
  ];
  readonly capabilities = {
    oauth: true,
    apiCredentials: true,
    credentialTokenAuth: true,
    accounts: false,
    balances: false,
    bankTransactions: false,
  };

  async authenticateCredentials(credentials: Record<string, string>): Promise<ProviderTokenSet> {
    const clientId = credentials.clientId?.trim();
    const clientSecret = credentials.clientSecret?.trim();
    const redirectUri = credentials.redirectUri?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Garanti BBVA clientId, clientSecret and redirectUri are required.');
    }

    let redirect: URL;
    try {
      redirect = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Garanti BBVA redirectUri is invalid.');
    }
    if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
      throw new BadRequestException('Garanti BBVA redirectUri must use HTTPS.');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('Garanti BBVA token service is unavailable.');
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await response.json() as Record<string, unknown>;
    } catch {
      // Provider response details are intentionally not exposed.
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Garanti BBVA token request failed.');
    }

    const accessToken = typeof payload.access_token === 'string' ? payload.access_token.trim() : '';
    if (!accessToken) {
      throw new ServiceUnavailableException('Garanti BBVA returned an invalid token response.');
    }
    const expiresIn = Number(payload.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + Math.floor(expiresIn * 1000))
      : undefined;

    return {
      accessToken,
      expiresAt,
      metadata: {
        tokenType: typeof payload.token_type === 'string' ? payload.token_type : undefined,
        source: 'GARANTI_BBVA_CLIENT_CREDENTIALS',
      },
    };
  }
}
