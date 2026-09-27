import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketingProviderVaultService } from './marketing-provider-vault.service';

type OAuthProvider = 'META' | 'GOOGLE_ADS' | 'TIKTOK';

type ConnectionRow = {
  id: string;
  provider: string;
  externalAccountId: string | null;
};

type StatePayload = {
  connectionId: string;
  provider: OAuthProvider;
  tenantId: string;
  companyId: string;
  actorUserId: string;
  expiresAt: number;
};

type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
  externalAccountIds?: string[];
};

@Injectable()
export class MarketingProviderOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContext,
    private readonly vault: MarketingProviderVaultService,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new BadRequestException(
        `${name} yapılandırılmadan bu platform için canlı yetkilendirme başlatılamaz.`,
      );
    }
    return value;
  }

  private stateKey() {
    return this.required('MARKETING_INTEGRATION_MASTER_KEY');
  }

  private encodeState(payload: StatePayload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.stateKey())
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private decodeState(state: string, actorUserId: string) {
    const [body, signature] = state.split('.');
    if (!body || !signature) {
      throw new BadRequestException('Yetkilendirme doğrulama bilgisi geçersiz.');
    }

    const expected = createHmac('sha256', this.stateKey())
      .update(body)
      .digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new BadRequestException('Yetkilendirme doğrulama bilgisi doğrulanamadı.');
    }

    let payload: StatePayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    } catch {
      throw new BadRequestException('Yetkilendirme doğrulama bilgisi okunamadı.');
    }

    const { tenantId, companyId } = this.context();
    if (
      payload.tenantId !== tenantId ||
      payload.companyId !== companyId ||
      payload.actorUserId !== actorUserId ||
      payload.expiresAt < Date.now()
    ) {
      throw new BadRequestException(
        'Yetkilendirme oturumu sona ermiş veya farklı bir kullanıcı/şirket için oluşturulmuş.',
      );
    }

    return payload;
  }

  private async connection(connectionId: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<ConnectionRow[]>(
      `SELECT id,provider,external_account_id AS "externalAccountId"
         FROM corporate_marketing_provider_connections
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        LIMIT 1`,
      connectionId,
      tenantId,
      companyId,
    );
    const connection = rows[0];
    if (!connection) {
      throw new NotFoundException('Entegrasyon bağlantısı bulunamadı.');
    }
    if (!['META', 'GOOGLE_ADS', 'TIKTOK'].includes(connection.provider)) {
      throw new BadRequestException(
        'Bu bağlantı türü otomatik platform yetkilendirmesini desteklemiyor.',
      );
    }
    return connection as ConnectionRow & { provider: OAuthProvider };
  }

  private scopes(name: string, fallback: string) {
    return (this.config.get<string>(name)?.trim() || fallback)
      .split(/[ ,]+/)
      .filter(Boolean)
      .join(' ');
  }

  async authorization(connectionId: string, actorUserId: string) {
    const connection = await this.connection(connectionId);
    const { tenantId, companyId } = this.context();
    const state = this.encodeState({
      connectionId,
      provider: connection.provider,
      tenantId,
      companyId,
      actorUserId,
      expiresAt: Date.now() + 10 * 60_000,
    });

    if (connection.provider === 'META') {
      const url = new URL(this.required('META_OAUTH_AUTHORIZATION_URL'));
      url.searchParams.set('client_id', this.required('META_OAUTH_CLIENT_ID'));
      url.searchParams.set('redirect_uri', this.required('META_OAUTH_REDIRECT_URI'));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        this.scopes(
          'META_OAUTH_SCOPES',
          'ads_read leads_retrieval business_management',
        ).replace(/ /g, ','),
      );
      url.searchParams.set('state', state);
      return { provider: connection.provider, authorizationUrl: url.toString() };
    }

    if (connection.provider === 'GOOGLE_ADS') {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', this.required('GOOGLE_OAUTH_CLIENT_ID'));
      url.searchParams.set('redirect_uri', this.required('GOOGLE_OAUTH_REDIRECT_URI'));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set(
        'scope',
        this.scopes(
          'GOOGLE_OAUTH_SCOPES',
          'https://www.googleapis.com/auth/adwords',
        ),
      );
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'true');
      url.searchParams.set('state', state);
      return { provider: connection.provider, authorizationUrl: url.toString() };
    }

    const url = new URL(this.required('TIKTOK_BUSINESS_AUTHORIZATION_URL'));
    url.searchParams.set('state', state);
    return { provider: connection.provider, authorizationUrl: url.toString() };
  }

  private async responseJson(response: Response) {
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!response.ok) {
      throw new BadRequestException(
        `Platform yetkilendirmesi tamamlanamadı (HTTP ${response.status}).`,
      );
    }
    return body as Record<string, unknown>;
  }

  private async exchangeMeta(code: string): Promise<TokenBundle> {
    const url = new URL(this.required('META_OAUTH_TOKEN_URL'));
    url.searchParams.set('client_id', this.required('META_OAUTH_CLIENT_ID'));
    url.searchParams.set('client_secret', this.required('META_OAUTH_CLIENT_SECRET'));
    url.searchParams.set('redirect_uri', this.required('META_OAUTH_REDIRECT_URI'));
    url.searchParams.set('code', code);
    const body = await this.responseJson(await fetch(url));
    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    if (!accessToken) throw new BadRequestException('Meta erişim anahtarı alınamadı.');
    return {
      accessToken,
      tokenType: typeof body.token_type === 'string' ? body.token_type : 'bearer',
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : undefined,
    };
  }

  private async exchangeGoogle(code: string): Promise<TokenBundle> {
    const form = new URLSearchParams({
      client_id: this.required('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.required('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: this.required('GOOGLE_OAUTH_REDIRECT_URI'),
      grant_type: 'authorization_code',
      code,
    });
    const body = await this.responseJson(
      await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }),
    );
    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    if (!accessToken) throw new BadRequestException('Google erişim anahtarı alınamadı.');
    return {
      accessToken,
      refreshToken:
        typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
      tokenType: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
      scope: typeof body.scope === 'string' ? body.scope : undefined,
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : undefined,
    };
  }

  private async exchangeTikTok(code: string): Promise<TokenBundle> {
    const body = await this.responseJson(
      await fetch(
        this.config.get<string>('TIKTOK_BUSINESS_TOKEN_URL')?.trim() ||
          'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            app_id: this.required('TIKTOK_BUSINESS_APP_ID'),
            secret: this.required('TIKTOK_BUSINESS_SECRET'),
            auth_code: code,
          }),
        },
      ),
    );

    const data =
      body.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : body;
    const accessToken =
      typeof data.access_token === 'string' ? data.access_token : '';
    if (!accessToken) {
      throw new BadRequestException('TikTok Business erişim anahtarı alınamadı.');
    }

    return {
      accessToken,
      externalAccountIds: Array.isArray(data.advertiser_ids)
        ? data.advertiser_ids.filter(
            (value): value is string => typeof value === 'string',
          )
        : undefined,
    };
  }

  async complete(
    connectionId: string,
    input: { code: string; state: string },
    actorUserId: string,
  ) {
    const connection = await this.connection(connectionId);
    const state = this.decodeState(input.state, actorUserId);
    if (
      state.connectionId !== connection.id ||
      state.provider !== connection.provider
    ) {
      throw new BadRequestException(
        'Yetkilendirme yanıtı bu entegrasyon bağlantısıyla eşleşmiyor.',
      );
    }

    const token =
      connection.provider === 'META'
        ? await this.exchangeMeta(input.code)
        : connection.provider === 'GOOGLE_ADS'
          ? await this.exchangeGoogle(input.code)
          : await this.exchangeTikTok(input.code);

    const expiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
      : '';

    await this.vault.store(connection.id, {
      provider: connection.provider,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? '',
      tokenType: token.tokenType ?? '',
      scope: token.scope ?? '',
      expiresAt,
      externalAccountIds: JSON.stringify(token.externalAccountIds ?? []),
      authorizedAt: new Date().toISOString(),
    });

    if (!connection.externalAccountId && token.externalAccountIds?.[0]) {
      const { tenantId, companyId } = this.context();
      await this.prisma.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET external_account_id=$4,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connection.id,
        tenantId,
        companyId,
        token.externalAccountIds[0],
      );
    }

    return {
      connectionId: connection.id,
      provider: connection.provider,
      connected: true,
      expiresAt: expiresAt || null,
      refreshSupported: Boolean(token.refreshToken),
      externalAccountIds: token.externalAccountIds ?? [],
    };
  }
}
