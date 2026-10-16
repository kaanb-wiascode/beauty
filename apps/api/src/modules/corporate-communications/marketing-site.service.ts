import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@beauty-erp/database';
import { createHash } from 'node:crypto';

import type { DemoRequestInput } from './marketing-site.schemas';

type LeadRow = {
  id: string;
  receivedAt: Date;
};

@Injectable()
export class MarketingSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private scope() {
    const tenantId = this.config.get<string>('MARKETING_DEMO_TENANT_ID')?.trim();
    const companyId = this.config.get<string>('MARKETING_DEMO_COMPANY_ID')?.trim();
    const branchId = this.config.get<string>('MARKETING_DEMO_BRANCH_ID')?.trim() || null;

    if (!tenantId || !companyId) {
      throw new ServiceUnavailableException(
        'Demo talebi alımı henüz yapılandırılmadı.',
      );
    }

    return { tenantId, companyId, branchId };
  }

  private externalLeadId(input: DemoRequestInput) {
    const day = new Date().toISOString().slice(0, 10);
    const identity = `${input.email.toLowerCase()}|${input.phone.replace(/\s+/g, '')}|${day}`;
    const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32);
    return `website-demo:${digest}`;
  }

  async createDemoRequest(input: DemoRequestInput, userAgent?: string) {
    const { tenantId, companyId, branchId } = this.scope();
    const externalLeadId = this.externalLeadId(input);
    const serviceInterest = [
      'VALOO Demo',
      input.businessType ? `İşletme: ${input.businessType}` : null,
      `${input.branchCount} şube`,
      input.employeeCount ? `${input.employeeCount} çalışan` : null,
    ].filter(Boolean).join(' · ');

    const sourcePayload = {
      source: 'VALOO_MARKETING_SITE',
      companyName: input.companyName,
      role: input.role ?? null,
      businessType: input.businessType ?? null,
      branchCount: input.branchCount,
      employeeCount: input.employeeCount ?? null,
      currentTools: input.currentTools ?? null,
      goal: input.goal ?? null,
      privacyNoticeAccepted: input.privacyNoticeAccepted,
      commercialConsent: input.commercialConsent,
      pageUrl: input.pageUrl ?? null,
      referrer: input.referrer ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
    };
    const attribution = {
      utmSource: input.utmSource ?? 'website',
      utmMedium: input.utmMedium ?? 'organic',
      utmCampaign: input.utmCampaign ?? null,
      utmContent: input.utmContent ?? null,
      utmTerm: input.utmTerm ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRawUnsafe<LeadRow[]>(
        `INSERT INTO corporate_marketing_leads(
           tenant_id,company_id,branch_id,provider,external_lead_id,
           first_name,last_name,phone,email,service_interest,source_payload,first_touch,last_touch
         ) VALUES(
           $1::text,$2::text,$3::text,'WEBSITE',$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$11::jsonb
         )
         ON CONFLICT DO NOTHING
         RETURNING id,received_at AS "receivedAt"`,
        tenantId,
        companyId,
        branchId,
        externalLeadId,
        input.firstName,
        input.lastName,
        input.phone,
        input.email,
        serviceInterest,
        JSON.stringify(sourcePayload),
        JSON.stringify(attribution),
      );

      let lead = inserted[0];
      let idempotent = false;

      if (!lead) {
        const existing = await tx.$queryRawUnsafe<LeadRow[]>(
          `SELECT id,received_at AS "receivedAt"
             FROM corporate_marketing_leads
            WHERE company_id=$1::text
              AND provider='WEBSITE'
              AND external_lead_id=$2
            LIMIT 1`,
          companyId,
          externalLeadId,
        );
        lead = existing[0];
        idempotent = true;
      }

      if (!lead) {
        throw new ServiceUnavailableException(
          'Demo talebi şu anda kaydedilemedi.',
        );
      }

      if (!idempotent) {
        await tx.$executeRawUnsafe(
          `INSERT INTO corporate_marketing_touchpoints(
             tenant_id,company_id,marketing_lead_id,provider,touch_type,
             utm_source,utm_medium,utm_campaign,utm_content,metadata
           ) VALUES(
             $1::text,$2::text,$3::text,'WEBSITE','LEAD_CAPTURE',
             $4,$5,$6,$7,$8::jsonb
           )`,
          tenantId,
          companyId,
          lead.id,
          attribution.utmSource,
          attribution.utmMedium,
          attribution.utmCampaign,
          attribution.utmContent,
          JSON.stringify({
            source: 'VALOO_MARKETING_SITE',
            pageUrl: input.pageUrl ?? null,
            referrer: input.referrer ?? null,
          }),
        );
      }

      return {
        accepted: true,
        requestId: lead.id,
        idempotent,
      };
    });
  }
}
