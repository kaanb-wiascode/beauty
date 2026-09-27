import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

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
