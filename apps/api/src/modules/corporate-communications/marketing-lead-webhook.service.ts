import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { MarketingProviderVaultService } from './marketing-provider-vault.service';

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time?: number;
        [key: string]: unknown;
      };
    }>;
  }>;
  [key: string]: unknown;
};

type GoogleWebhookPayload = {
  lead_id?: string;
  campaign_id?: string | number;
  gcl_id?: string;
  google_key?: string;
  is_test?: boolean;
  lead_submit_time?: string;
  user_column_data?: Array<{
    column_id?: string;
    column_name?: string;
    string_value?: string;
  }>;
  [key: string]: unknown;
};

@Injectable()
export class MarketingLeadWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContext,
    private readonly vault: MarketingProviderVaultService,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private hashSecret(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private equalHash(left: string, right: string) {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  verifyMetaChallenge(input: {
    mode?: string;
    verifyToken?: string;
    challenge?: string;
  }) {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN')?.trim();
    if (
      !expected ||
      input.mode !== 'subscribe' ||
      !input.verifyToken ||
      input.verifyToken !== expected ||
      !input.challenge
    ) {
      throw new ForbiddenException('Meta webhook doğrulaması başarısız.');
    }
    return input.challenge;
  }

  private verifyMetaSignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const appSecret = this.config.get<string>('META_OAUTH_CLIENT_SECRET')?.trim();
    if (!appSecret || !rawBody || !signature?.startsWith('sha256=')) {
      throw new ForbiddenException('Meta webhook imzası doğrulanamadı.');
    }
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signature.slice('sha256='.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(received) || !this.equalHash(expected, received)) {
      throw new ForbiddenException('Meta webhook imzası geçersiz.');
    }
  }

  private normalizeMetaFields(value: unknown) {
    const fields: Record<string, string> = {};
    if (!Array.isArray(value)) return fields;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim().toUpperCase() : '';
      const values = Array.isArray(row.values)
        ? row.values.filter((item): item is string => typeof item === 'string')
        : [];
      if (name && values.length) fields[name] = values.join(', ');
    }
    return fields;
  }

  private async fetchMetaLead(
    connectionId: string,
    tenantId: string,
    companyId: string,
    pageId: string,
    leadgenId: string,
  ) {
    const secrets = await this.vault.loadScoped(connectionId, tenantId, companyId);
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
        'Meta Page erişim anahtarı bulunamadı. Page aboneliğini yeniden yapılandırın.',
      );
    }

    const base =
      this.config.get<string>('META_GRAPH_API_BASE_URL')?.trim() ||
      'https://graph.facebook.com';
    const version = this.config.get<string>('META_GRAPH_API_VERSION')?.trim();
    if (!version) {
      throw new BadRequestException(
        'META_GRAPH_API_VERSION yapılandırılmadan Meta lead verisi alınamaz.',
      );
    }
    const root = base.endsWith('/') ? base.slice(0, -1) : base;
    const url = new URL(`${root}/${version}/${encodeURIComponent(leadgenId)}`);
    url.searchParams.set('fields', 'id,created_time,ad_id,form_id,field_data');
    url.searchParams.set('access_token', pageToken);

    const response = await fetch(url);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok || !body || typeof body !== 'object') {
      throw new BadRequestException(
        `Meta lead verisi alınamadı (HTTP ${response.status}).`,
      );
    }
    return body as Record<string, unknown>;
  }

  async ingestMeta(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    payload: MetaWebhookPayload,
  ) {
    this.verifyMetaSignature(rawBody, signature);
    if (payload.object !== 'page') {
      return { accepted: true, inserted: 0, duplicates: 0, skipped: 0 };
    }

    let inserted = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const value = change.value ?? {};
        const pageId = value.page_id?.trim();
        const leadgenId = value.leadgen_id?.trim();
        if (!pageId || !leadgenId) {
          skipped += 1;
          continue;
        }

        const mappings = await this.prisma.$queryRawUnsafe<Array<{
          connectionId: string;
          tenantId: string;
          companyId: string;
        }>>(
          `SELECT a.connection_id AS "connectionId",
                  a.tenant_id AS "tenantId",
                  a.company_id AS "companyId"
             FROM corporate_marketing_provider_assets a
             JOIN corporate_marketing_provider_connections c
               ON c.id=a.connection_id
              AND c.tenant_id=a.tenant_id
              AND c.company_id=a.company_id
            WHERE a.provider='META'
              AND a.asset_type='PAGE'
              AND a.external_asset_id=$1
              AND a.active=TRUE
              AND c.status IN ('AUTHORIZED','CONNECTED','ERROR')
            LIMIT 1`,
          pageId,
        );
        const mapping = mappings[0];
        if (!mapping) {
          skipped += 1;
          continue;
        }

        const lead = await this.fetchMetaLead(
          mapping.connectionId,
          mapping.tenantId,
          mapping.companyId,
          pageId,
          leadgenId,
        );
        const fields = this.normalizeMetaFields(lead.field_data);
        const fullName =
          fields.FULL_NAME ||
          [fields.FIRST_NAME, fields.LAST_NAME].filter(Boolean).join(' ').trim();
        const [firstName, ...lastNameParts] = (fullName || 'Meta').split(/\s+/);
        const lastName = lastNameParts.join(' ') || 'Lead';
        const phone = fields.PHONE_NUMBER || fields.PHONE || null;
        const email = fields.EMAIL || null;
        if (!phone && !email) {
          skipped += 1;
          continue;
        }

        const created = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO corporate_marketing_leads(
             tenant_id,company_id,provider,external_lead_id,
             first_name,last_name,phone,email,status,source_payload,first_touch,last_touch
           ) VALUES(
             $1::text,$2::text,'META',$3,$4,$5,$6,$7,
             'NEW',$8::jsonb,$9::jsonb,$9::jsonb
           )
           ON CONFLICT DO NOTHING
           RETURNING id`,
          mapping.tenantId,
          mapping.companyId,
          leadgenId,
          firstName,
          lastName,
          phone,
          email,
          JSON.stringify({
            connectionId: mapping.connectionId,
            webhook: true,
            pageId,
            formId: value.form_id ?? lead.form_id ?? null,
            adId: value.ad_id ?? lead.ad_id ?? null,
            createdTime: value.created_time ?? lead.created_time ?? null,
            fields,
            raw: lead,
          }),
          JSON.stringify({
            externalAdId: value.ad_id ?? lead.ad_id ?? null,
            utmSource: 'meta',
            utmMedium: 'paid',
          }),
        );

        if (!created.length) {
          duplicates += 1;
          continue;
        }

        inserted += 1;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO corporate_marketing_touchpoints(
             tenant_id,company_id,marketing_lead_id,provider,touch_type,
             external_ad_id,utm_source,utm_medium,metadata
           ) VALUES(
             $1::text,$2::text,$3::text,'META','LEAD_CAPTURE',
             $4,'meta','paid',$5::jsonb
           )`,
          mapping.tenantId,
          mapping.companyId,
          created[0]!.id,
          value.ad_id ?? (typeof lead.ad_id === 'string' ? lead.ad_id : null),
          JSON.stringify({
            source: 'META_LEADGEN_WEBHOOK',
            connectionId: mapping.connectionId,
            pageId,
            formId: value.form_id ?? lead.form_id ?? null,
            externalLeadId: leadgenId,
          }),
        );
      }
    }

    return { accepted: true, inserted, duplicates, skipped };
  }

  async configureGoogleWebhook(connectionId: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; provider: string }>>(
      `SELECT id,provider
         FROM corporate_marketing_provider_connections
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
        LIMIT 1`,
      connectionId,
      tenantId,
      companyId,
    );
    const connection = rows[0];
    if (!connection) throw new NotFoundException('Entegrasyon bağlantısı bulunamadı.');
    if (connection.provider !== 'GOOGLE_ADS') {
      throw new BadRequestException(
        'Bu webhook yapılandırması yalnızca Google Ads bağlantıları için kullanılabilir.',
      );
    }

    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL')?.replace(/\/$/, '');
    if (!publicApiUrl) {
      throw new BadRequestException(
        'PUBLIC_API_URL yapılandırılmadan webhook adresi oluşturulamaz.',
      );
    }

    const secret = randomBytes(32).toString('base64url');
    await this.prisma.$executeRawUnsafe(
      `UPDATE corporate_marketing_provider_connections
          SET webhook_secret_hash=$4,webhook_configured_at=NOW(),updated_at=NOW()
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      connectionId,
      tenantId,
      companyId,
      this.hashSecret(secret),
    );

    return {
      provider: 'GOOGLE_ADS',
      connectionId,
      webhookUrl: `${publicApiUrl}/marketing-webhooks/google-ads/${connectionId}`,
      webhookSecret: secret,
      secretVisibleOnce: true,
    };
  }

  private normalizeColumns(payload: GoogleWebhookPayload) {
    const fields: Record<string, string> = {};
    for (const item of payload.user_column_data ?? []) {
      const key = item.column_id?.trim().toUpperCase();
      const value = item.string_value?.trim();
      if (key && value) fields[key] = value;
    }
    return fields;
  }

  async ingestGoogle(connectionId: string, payload: GoogleWebhookPayload) {
    const leadId = payload.lead_id?.trim();
    const campaignId =
      payload.campaign_id == null ? '' : String(payload.campaign_id).trim();
    const googleKey = payload.google_key?.trim();

    if (!leadId || !campaignId || !googleKey) {
      throw new BadRequestException(
        'Google Ads webhook isteğinde lead_id, campaign_id ve google_key alanları gereklidir.',
      );
    }

    const mappings = await this.prisma.$queryRawUnsafe<Array<{
      connectionId: string;
      tenantId: string;
      companyId: string;
      campaignId: string | null;
      webhookSecretHash: string | null;
    }>>(
      `SELECT pc.connection_id AS "connectionId",
              pc.tenant_id AS "tenantId",
              pc.company_id AS "companyId",
              pc.campaign_id AS "campaignId",
              c.webhook_secret_hash AS "webhookSecretHash"
         FROM corporate_marketing_provider_campaigns pc
         JOIN corporate_marketing_provider_connections c
           ON c.id=pc.connection_id
          AND c.tenant_id=pc.tenant_id
          AND c.company_id=pc.company_id
        WHERE pc.provider='GOOGLE_ADS'
          AND pc.connection_id=$1::text
          AND pc.external_campaign_id=$2
        ORDER BY pc.synced_at DESC
        LIMIT 1`,
      connectionId,
      campaignId,
    );

    if (!mappings.length) {
      throw new NotFoundException(
        'Webhook kampanyası bu Google Ads bağlantısıyla eşleştirilemedi.',
      );
    }

    const mapping = mappings[0]!;
    if (!mapping.webhookSecretHash) {
      throw new ForbiddenException(
        'Bu Google Ads bağlantısı için webhook doğrulama anahtarı yapılandırılmamış.',
      );
    }
    if (!this.equalHash(mapping.webhookSecretHash, this.hashSecret(googleKey))) {
      throw new ForbiddenException('Google Ads webhook doğrulama anahtarı geçersiz.');
    }

    if (payload.is_test) {
      return { accepted: true, test: true, duplicate: false };
    }

    const fields = this.normalizeColumns(payload);
    const fullName =
      fields.FULL_NAME ||
      [fields.FIRST_NAME, fields.LAST_NAME].filter(Boolean).join(' ').trim();
    const [firstName, ...lastNameParts] = (fullName || 'Google Ads').split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Lead';
    const phone =
      fields.PHONE_NUMBER ||
      fields.PHONE ||
      fields.WORK_PHONE ||
      null;
    const email =
      fields.EMAIL ||
      fields.WORK_EMAIL ||
      null;

    if (!phone && !email) {
      throw new BadRequestException(
        'Google Ads potansiyel müşteri kaydında telefon veya e-posta bulunamadı.',
      );
    }

    const inserted = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO corporate_marketing_leads(
         tenant_id,company_id,campaign_id,provider,external_lead_id,
         first_name,last_name,phone,email,status,source_payload,first_touch,last_touch
       ) VALUES(
         $1::text,$2::text,$3::text,'GOOGLE_ADS',$4,$5,$6,$7,$8,
         'NEW',$9::jsonb,$10::jsonb,$10::jsonb
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      mapping.tenantId,
      mapping.companyId,
      mapping.campaignId,
      leadId,
      firstName,
      lastName,
      phone,
      email,
      JSON.stringify({
        connectionId: mapping.connectionId,
        webhook: true,
        leadSubmitTime: payload.lead_submit_time ?? null,
        fields,
        raw: payload,
      }),
      JSON.stringify({
        externalCampaignId: campaignId,
        clickId: payload.gcl_id ?? null,
        utmSource: 'google',
        utmMedium: 'paid',
      }),
    );

    if (!inserted.length) {
      return { accepted: true, test: false, duplicate: true };
    }

    const marketingLeadId = inserted[0]!.id;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_touchpoints(
         tenant_id,company_id,marketing_lead_id,campaign_id,provider,touch_type,
         external_campaign_id,click_id,utm_source,utm_medium,metadata
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,'GOOGLE_ADS','LEAD_CAPTURE',
         $5,$6,'google','paid',$7::jsonb
       )`,
      mapping.tenantId,
      mapping.companyId,
      marketingLeadId,
      mapping.campaignId,
      campaignId,
      payload.gcl_id ?? null,
      JSON.stringify({
        source: 'GOOGLE_ADS_WEBHOOK',
        connectionId: mapping.connectionId,
        externalLeadId: leadId,
      }),
    );

    return {
      accepted: true,
      test: false,
      duplicate: false,
      marketingLeadId,
    };
  }
}
