import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketingProviderOAuthService } from './marketing-provider-oauth.service';
import { MarketingProviderVaultService } from './marketing-provider-vault.service';

type Provider = 'META' | 'GOOGLE_ADS' | 'TIKTOK';

type ConnectionRow = {
  id: string;
  provider: Provider;
  externalAccountId: string | null;
};

@Injectable()
export class MarketingProviderAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContext,
    private readonly oauth: MarketingProviderOAuthService,
    private readonly vault: MarketingProviderVaultService,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new BadRequestException(
        `${name} yapılandırılmadan reklam hesabı bilgileri alınamaz.`,
      );
    }
    return value;
  }

  private async connection(connectionId: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<ConnectionRow[]>(
      `SELECT id,provider,external_account_id AS "externalAccountId"
         FROM corporate_marketing_provider_connections
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND provider IN ('META','GOOGLE_ADS','TIKTOK')
        LIMIT 1`,
      connectionId,
      tenantId,
      companyId,
    );
    const connection = rows[0];
    if (!connection) throw new NotFoundException('Entegrasyon bağlantısı bulunamadı.');
    return connection;
  }

  private async accessToken(connectionId: string) {
    const secrets = await this.vault.load(connectionId);
    if (!secrets?.accessToken) {
      throw new BadRequestException(
        'Platform erişim bilgisi bulunamadı. Önce hesabı yetkilendirin.',
      );
    }
    if (secrets.expiresAt) {
      const expiresAt = Date.parse(secrets.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 5 * 60_000) {
        await this.oauth.refresh(connectionId);
        const refreshed = await this.vault.load(connectionId);
        if (refreshed?.accessToken) return refreshed.accessToken;
      }
    }
    return secrets.accessToken;
  }

  private async fetchJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      throw new BadRequestException(
        `Platform reklam hesapları alınamadı (HTTP ${response.status}).`,
      );
    }
    return body as Record<string, unknown>;
  }

  private async metaAccounts(connectionId: string) {
    const token = await this.accessToken(connectionId);
    const base =
      this.config.get<string>('META_GRAPH_API_BASE_URL')?.trim() ||
      'https://graph.facebook.com';
    const url = new URL('/me/adaccounts', base.endsWith('/') ? base : `${base}/`);
    url.searchParams.set('fields', 'id,name,account_id,account_status,currency,timezone_name');
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', token);
    const body = await this.fetchJson(url.toString());
    const data = Array.isArray(body.data) ? body.data : [];
    return data
      .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        id:
          typeof item.account_id === 'string'
            ? item.account_id
            : typeof item.id === 'string'
              ? item.id.replace(/^act_/, '')
              : '',
        name: typeof item.name === 'string' ? item.name : 'Meta Ads hesabı',
        status: item.account_status == null ? null : String(item.account_status),
        currency: typeof item.currency === 'string' ? item.currency : null,
        timezone: typeof item.timezone_name === 'string' ? item.timezone_name : null,
      }))
      .filter((item) => item.id);
  }

  private async googleAccounts(connectionId: string) {
    const token = await this.accessToken(connectionId);
    const version =
      this.config.get<string>('GOOGLE_ADS_API_VERSION')?.trim() || 'v25';
    const url = `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`;
    const body = await this.fetchJson(url, {
      headers: {
        authorization: `Bearer ${token}`,
        'developer-token': this.required('GOOGLE_ADS_DEVELOPER_TOKEN'),
        'content-type': 'application/json',
      },
    });
    const names = Array.isArray(body.resourceNames) ? body.resourceNames : [];
    return names
      .filter((value): value is string => typeof value === 'string')
      .map((resourceName) => {
        const id = resourceName.replace(/^customers\//, '');
        return {
          id,
          name: `Google Ads · ${id}`,
          status: null,
          currency: null,
          timezone: null,
        };
      });
  }

  private async tiktokAccounts(connectionId: string) {
    const secrets = await this.vault.load(connectionId);
    if (!secrets?.accessToken) {
      throw new BadRequestException(
        'TikTok Business erişim bilgisi bulunamadı. Önce hesabı yetkilendirin.',
      );
    }
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(secrets.externalAccountIds || '[]') as unknown;
      ids = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      ids = [];
    }
    return ids.map((id) => ({
      id,
      name: `TikTok Ads · ${id}`,
      status: null,
      currency: null,
      timezone: null,
    }));
  }

  async metaPages(connectionId: string) {
    const connection = await this.connection(connectionId);
    if (connection.provider !== 'META') {
      throw new BadRequestException(
        'Facebook Page keşfi yalnızca Meta bağlantıları için kullanılabilir.',
      );
    }

    const token = await this.accessToken(connection.id);
    const base =
      this.config.get<string>('META_GRAPH_API_BASE_URL')?.trim() ||
      'https://graph.facebook.com';
    const version = this.required('META_GRAPH_API_VERSION');
    const root = base.endsWith('/') ? base.slice(0, -1) : base;
    const url = new URL(`${root}/${version}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token');
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', token);

    const body = await this.fetchJson(url.toString());
    const data = Array.isArray(body.data) ? body.data : [];
    const pageTokens: Record<string, string> = {};
    const pages = data.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) return [];
      if (typeof row.access_token === 'string' && row.access_token) {
        pageTokens[id] = row.access_token;
      }
      return [{
        id,
        name: typeof row.name === 'string' ? row.name : `Facebook Page · ${id}`,
      }];
    });

    await this.vault.merge(connection.id, {
      metaPageTokens: JSON.stringify(pageTokens),
      metaPagesDiscoveredAt: new Date().toISOString(),
    });

    const { tenantId, companyId } = this.context();
    const subscribed = await this.prisma.$queryRawUnsafe<Array<{
      externalAssetId: string;
    }>>(
      `SELECT external_asset_id AS "externalAssetId"
         FROM corporate_marketing_provider_assets
        WHERE connection_id=$1::text
          AND tenant_id=$2::text
          AND company_id=$3::text
          AND provider='META'
          AND asset_type='PAGE'
          AND active=TRUE`,
      connection.id,
      tenantId,
      companyId,
    );
    const subscribedIds = new Set(subscribed.map((item) => item.externalAssetId));

    return {
      connectionId: connection.id,
      pages: pages.map((page) => ({
        ...page,
        subscribed: subscribedIds.has(page.id),
      })),
    };
  }

  async subscribeMetaPage(connectionId: string, pageId: string) {
    const connection = await this.connection(connectionId);
    if (connection.provider !== 'META') {
      throw new BadRequestException(
        'Facebook Page aboneliği yalnızca Meta bağlantıları için kullanılabilir.',
      );
    }

    const pages = await this.metaPages(connection.id);
    const page = pages.pages.find((item) => item.id === pageId);
    if (!page) {
      throw new BadRequestException(
        'Seçilen Facebook Page bu Meta yetkilendirmesi kapsamında erişilebilir değil.',
      );
    }

    const secrets = await this.vault.load(connection.id);
    let pageTokens: Record<string, string> = {};
    try {
      const parsed = JSON.parse(secrets?.metaPageTokens || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        pageTokens = parsed as Record<string, string>;
      }
    } catch {
      pageTokens = {};
    }
    const pageToken = pageTokens[pageId];
    if (!pageToken) {
      throw new BadRequestException(
        'Facebook Page erişim anahtarı alınamadı. Meta hesabını yeniden yetkilendirin.',
      );
    }

    const base =
      this.config.get<string>('META_GRAPH_API_BASE_URL')?.trim() ||
      'https://graph.facebook.com';
    const version = this.required('META_GRAPH_API_VERSION');
    const root = base.endsWith('/') ? base.slice(0, -1) : base;
    const url = new URL(`${root}/${version}/${encodeURIComponent(pageId)}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', 'leadgen');
    url.searchParams.set('access_token', pageToken);
    const response = await this.fetchJson(url.toString(), { method: 'POST' });
    if (response.success !== true) {
      throw new BadRequestException(
        'Meta leadgen webhook aboneliği platform tarafından onaylanmadı.',
      );
    }

    const { tenantId, companyId } = this.context();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_provider_assets(
         tenant_id,company_id,connection_id,provider,asset_type,
         external_asset_id,name,metadata,active,updated_at
       ) VALUES(
         $1::text,$2::text,$3::text,'META','PAGE',$4,$5,$6::jsonb,TRUE,NOW()
       )
       ON CONFLICT(connection_id,asset_type,external_asset_id) DO UPDATE SET
         name=EXCLUDED.name,
         metadata=EXCLUDED.metadata,
         active=TRUE,
         updated_at=NOW()`,
      tenantId,
      companyId,
      connection.id,
      pageId,
      page.name,
      JSON.stringify({
        subscribedFields: ['leadgen'],
        subscribedAt: new Date().toISOString(),
      }),
    );

    return {
      connectionId: connection.id,
      pageId,
      pageName: page.name,
      subscribed: true,
    };
  }

  async list(connectionId: string) {
    const connection = await this.connection(connectionId);
    const accounts =
      connection.provider === 'META'
        ? await this.metaAccounts(connection.id)
        : connection.provider === 'GOOGLE_ADS'
          ? await this.googleAccounts(connection.id)
          : await this.tiktokAccounts(connection.id);

    return {
      connectionId: connection.id,
      provider: connection.provider,
      selectedAccountId: connection.externalAccountId,
      accounts,
    };
  }

  async select(connectionId: string, externalAccountId: string) {
    const connection = await this.connection(connectionId);
    const discovered = await this.list(connectionId);
    if (!discovered.accounts.some((account) => account.id === externalAccountId)) {
      throw new BadRequestException(
        'Seçilen reklam hesabı bu yetkilendirme kapsamında erişilebilir değil.',
      );
    }

    const { tenantId, companyId } = this.context();
    await this.prisma.$executeRawUnsafe(
      `UPDATE corporate_marketing_provider_connections
          SET external_account_id=$4,updated_at=NOW()
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      connection.id,
      tenantId,
      companyId,
      externalAccountId,
    );

    return {
      connectionId: connection.id,
      provider: connection.provider,
      externalAccountId,
    };
  }
}
