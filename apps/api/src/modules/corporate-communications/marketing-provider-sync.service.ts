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

type SyncedCampaign = {
  externalCampaignId: string;
  name: string;
  status: string | null;
  objective: string | null;
  currency: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  raw: Record<string, unknown>;
};

@Injectable()
export class MarketingProviderSyncService {
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
        `${name} yapılandırılmadan reklam verileri eşitlenemez.`,
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
    if (!connection.externalAccountId) {
      throw new BadRequestException(
        'Veri eşitlemeden önce erişilebilir bir reklam hesabı seçilmelidir.',
      );
    }
    return connection;
  }

  private async accessToken(connection: ConnectionRow) {
    let secrets = await this.vault.load(connection.id);
    if (!secrets?.accessToken) {
      throw new BadRequestException(
        'Platform erişim bilgisi bulunamadı. Önce hesabı yetkilendirin.',
      );
    }

    if (connection.provider === 'GOOGLE_ADS' && secrets.expiresAt) {
      const expiresAt = Date.parse(secrets.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60_000) {
        await this.oauth.refresh(connection.id);
        secrets = await this.vault.load(connection.id);
      }
    }

    if (!secrets?.accessToken) {
      throw new BadRequestException('Platform erişim anahtarı kullanılamıyor.');
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
        `Reklam platformu verileri alınamadı (HTTP ${response.status}).`,
      );
    }
    return body;
  }

  private async metaCampaigns(connection: ConnectionRow): Promise<SyncedCampaign[]> {
    const accessToken = await this.accessToken(connection);
    const base =
      this.config.get<string>('META_GRAPH_API_BASE_URL')?.trim() ||
      'https://graph.facebook.com';
    const version = this.required('META_GRAPH_API_VERSION');
    const accountId = connection.externalAccountId!.replace(/^act_/, '');
    const root = base.endsWith('/') ? base.slice(0, -1) : base;

    const accountUrl = new URL(`${root}/${version}/act_${accountId}`);
    accountUrl.searchParams.set('fields', 'currency');
    accountUrl.searchParams.set('access_token', accessToken);
    const accountBody = await this.fetchJson(accountUrl.toString());
    const account =
      accountBody && typeof accountBody === 'object'
        ? accountBody as Record<string, unknown>
        : {};
    const currency =
      typeof account.currency === 'string' ? account.currency : null;

    const campaignUrl = new URL(`${root}/${version}/act_${accountId}/campaigns`);
    campaignUrl.searchParams.set('fields', 'id,name,status,objective');
    campaignUrl.searchParams.set('limit', '200');
    campaignUrl.searchParams.set('access_token', accessToken);
    const campaignBody = await this.fetchJson(campaignUrl.toString());
    const campaignData =
      campaignBody && typeof campaignBody === 'object'
        ? (campaignBody as Record<string, unknown>).data
        : [];
    const campaigns = Array.isArray(campaignData) ? campaignData : [];

    const until = new Date();
    const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const date = (value: Date) => value.toISOString().slice(0, 10);

    const insightUrl = new URL(`${root}/${version}/act_${accountId}/insights`);
    insightUrl.searchParams.set('level', 'campaign');
    insightUrl.searchParams.set(
      'fields',
      'campaign_id,campaign_name,spend,impressions,clicks',
    );
    insightUrl.searchParams.set(
      'time_range',
      JSON.stringify({ since: date(since), until: date(until) }),
    );
    insightUrl.searchParams.set('limit', '200');
    insightUrl.searchParams.set('access_token', accessToken);
    const insightBody = await this.fetchJson(insightUrl.toString());
    const insightData =
      insightBody && typeof insightBody === 'object'
        ? (insightBody as Record<string, unknown>).data
        : [];
    const insights = Array.isArray(insightData) ? insightData : [];

    const byId = new Map<string, Record<string, unknown>>();
    for (const item of insights) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.campaign_id === 'string' ? row.campaign_id : '';
      if (id) byId.set(id, row);
    }

    return campaigns.flatMap((entry): SyncedCampaign[] => {
      if (!entry || typeof entry !== 'object') return [];
      const campaign = entry as Record<string, unknown>;
      const id = typeof campaign.id === 'string' ? campaign.id : '';
      if (!id) return [];
      const metrics = byId.get(id) ?? {};

      return [{
        externalCampaignId: id,
        name:
          typeof campaign.name === 'string'
            ? campaign.name
            : `Meta kampanyası · ${id}`,
        status: typeof campaign.status === 'string' ? campaign.status : null,
        objective:
          typeof campaign.objective === 'string' ? campaign.objective : null,
        currency,
        spend: Number(metrics.spend ?? 0),
        impressions: Number(metrics.impressions ?? 0),
        clicks: Number(metrics.clicks ?? 0),
        conversions: 0,
        conversionValue: 0,
        raw: {
          campaign,
          insights: metrics,
        },
      }];
    });
  }

  private async googleCampaigns(connection: ConnectionRow): Promise<SyncedCampaign[]> {
    const accessToken = await this.accessToken(connection);
    const version =
      this.config.get<string>('GOOGLE_ADS_API_VERSION')?.trim() || 'v25';
    const customerId = connection.externalAccountId!.replace(/-/g, '');
    const url =
      `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      'developer-token': this.required('GOOGLE_ADS_DEVELOPER_TOKEN'),
      'content-type': 'application/json',
    };
    const loginCustomerId = this.config
      .get<string>('GOOGLE_ADS_LOGIN_CUSTOMER_ID')
      ?.replace(/-/g, '')
      .trim();
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const body = await this.fetchJson(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign.advertising_channel_type,
            customer.currency_code,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions,
            metrics.conversions_value
          FROM campaign
          WHERE segments.date DURING LAST_30_DAYS
            AND campaign.status != 'REMOVED'
        `,
      }),
    });

    const chunks = Array.isArray(body) ? body : [];
    const results = chunks.flatMap((chunk) => {
      if (!chunk || typeof chunk !== 'object') return [];
      const value = (chunk as Record<string, unknown>).results;
      return Array.isArray(value) ? value : [];
    });

    return results.flatMap((entry): SyncedCampaign[] => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      const campaign =
        row.campaign && typeof row.campaign === 'object'
          ? row.campaign as Record<string, unknown>
          : {};
      const customer =
        row.customer && typeof row.customer === 'object'
          ? row.customer as Record<string, unknown>
          : {};
      const metrics =
        row.metrics && typeof row.metrics === 'object'
          ? row.metrics as Record<string, unknown>
          : {};
      const id = campaign.id == null ? '' : String(campaign.id);
      if (!id) return [];

      return [{
        externalCampaignId: id,
        name:
          typeof campaign.name === 'string'
            ? campaign.name
            : `Google Ads kampanyası · ${id}`,
        status:
          typeof campaign.status === 'string' ? campaign.status : null,
        objective:
          typeof campaign.advertisingChannelType === 'string'
            ? campaign.advertisingChannelType
            : null,
        currency:
          typeof customer.currencyCode === 'string'
            ? customer.currencyCode
            : null,
        spend: Number(metrics.costMicros ?? 0) / 1_000_000,
        impressions: Number(metrics.impressions ?? 0),
        clicks: Number(metrics.clicks ?? 0),
        conversions: Number(metrics.conversions ?? 0),
        conversionValue: Number(metrics.conversionsValue ?? 0),
        raw: row,
      }];
    });
  }

  private internalStatus(providerStatus: string | null) {
    if (providerStatus === 'ENABLED' || providerStatus === 'ACTIVE') return 'ACTIVE';
    if (providerStatus === 'PAUSED') return 'PAUSED';
    if (providerStatus === 'REMOVED' || providerStatus === 'DELETED') return 'CANCELLED';
    return 'PLANNED';
  }

  private async persistCampaign(
    connection: ConnectionRow,
    campaign: SyncedCampaign,
    actorUserId: string,
  ) {
    const { tenantId, companyId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.$queryRawUnsafe<Array<{ campaignId: string | null }>>(
        `SELECT campaign_id AS "campaignId"
           FROM corporate_marketing_provider_campaigns
          WHERE connection_id=$1::text AND external_campaign_id=$2
            AND tenant_id=$3::text AND company_id=$4::text
          LIMIT 1`,
        connection.id,
        campaign.externalCampaignId,
        tenantId,
        companyId,
      );

      let campaignId = mapping[0]?.campaignId ?? null;
      if (!campaignId) {
        const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO corporate_communication_campaigns(
             tenant_id,company_id,name,objective,status,channel,
             planned_budget,spent_amount,currency,notes,created_by_user_id
           ) VALUES($1::text,$2::text,$3,'LEAD_GENERATION',$4,$5,0,$6,$7,$8,$9::text)
           RETURNING id`,
          tenantId,
          companyId,
          campaign.name,
          this.internalStatus(campaign.status),
          connection.provider,
          campaign.spend,
          campaign.currency ?? 'TRY',
          `Harici reklam platformundan eşitlendi · ${connection.provider} · ${campaign.externalCampaignId}`,
          actorUserId,
        );
        campaignId = inserted[0]?.id ?? null;
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE corporate_communication_campaigns
              SET name=$4,status=$5,channel=$6,spent_amount=$7,
                  currency=COALESCE($8,currency),updated_at=NOW()
            WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          campaignId,
          tenantId,
          companyId,
          campaign.name,
          this.internalStatus(campaign.status),
          connection.provider,
          campaign.spend,
          campaign.currency,
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_provider_campaigns(
           tenant_id,company_id,connection_id,campaign_id,provider,
           external_account_id,external_campaign_id,name,status,objective,currency,
           spend,impressions,clicks,conversions,conversion_value,raw_payload,synced_at,updated_at
         ) VALUES(
           $1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,$11,
           $12,$13,$14,$15,$16,$17::jsonb,NOW(),NOW()
         )
         ON CONFLICT(connection_id,external_campaign_id) DO UPDATE SET
           campaign_id=EXCLUDED.campaign_id,
           external_account_id=EXCLUDED.external_account_id,
           name=EXCLUDED.name,
           status=EXCLUDED.status,
           objective=EXCLUDED.objective,
           currency=EXCLUDED.currency,
           spend=EXCLUDED.spend,
           impressions=EXCLUDED.impressions,
           clicks=EXCLUDED.clicks,
           conversions=EXCLUDED.conversions,
           conversion_value=EXCLUDED.conversion_value,
           raw_payload=EXCLUDED.raw_payload,
           synced_at=NOW(),
           updated_at=NOW()`,
        tenantId,
        companyId,
        connection.id,
        campaignId,
        connection.provider,
        connection.externalAccountId,
        campaign.externalCampaignId,
        campaign.name,
        campaign.status,
        campaign.objective,
        campaign.currency,
        campaign.spend,
        Math.trunc(campaign.impressions),
        Math.trunc(campaign.clicks),
        campaign.conversions,
        campaign.conversionValue,
        JSON.stringify(campaign.raw),
      );

      return campaignId;
    });
  }

  async sync(connectionId: string, actorUserId: string) {
    const connection = await this.connection(connectionId);
    try {
      const campaigns =
        connection.provider === 'GOOGLE_ADS'
          ? await this.googleCampaigns(connection)
          : connection.provider === 'META'
            ? await this.metaCampaigns(connection)
            : (() => {
                throw new BadRequestException(
                  'Bu platformun kampanya senkronizasyonu henüz etkinleştirilmedi.',
                );
              })();

      const linkedCampaignIds: string[] = [];
      for (const campaign of campaigns) {
        const id = await this.persistCampaign(connection, campaign, actorUserId);
        if (id) linkedCampaignIds.push(id);
      }

      const { tenantId, companyId } = this.context();
      await this.prisma.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET status='CONNECTED',last_sync_at=NOW(),last_error=NULL,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connection.id,
        tenantId,
        companyId,
      );

      return {
        connectionId: connection.id,
        provider: connection.provider,
        externalAccountId: connection.externalAccountId,
        campaignsReceived: campaigns.length,
        campaignsLinked: linkedCampaignIds.length,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      const { tenantId, companyId } = this.context();
      const message =
        error instanceof Error ? error.message : 'Reklam verileri eşitlenemedi.';
      await this.prisma.$executeRawUnsafe(
        `UPDATE corporate_marketing_provider_connections
            SET status='ERROR',last_error=$4,updated_at=NOW()
          WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        connection.id,
        tenantId,
        companyId,
        message.slice(0, 1000),
      );
      throw error;
    }
  }
}
