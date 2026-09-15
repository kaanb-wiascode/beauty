import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateLeadInput, UpdateLeadInput } from './crm.schemas';

type DbClient = Prisma.TransactionClient | PrismaService;
type AcquisitionInput = Pick<CreateLeadInput,
  'acquisitionChannelId' | 'acquisitionSourceId' | 'acquisitionCampaignRefId' |
  'acquisitionAdSetRefId' | 'acquisitionAdRefId'
> | Pick<UpdateLeadInput,
  'acquisitionChannelId' | 'acquisitionSourceId' | 'acquisitionCampaignRefId' |
  'acquisitionAdSetRefId' | 'acquisitionAdRefId'
>;

export interface ResolvedAcquisitionRefs {
  acquisitionChannelId: string | null;
  acquisitionSourceId: string | null;
  acquisitionCampaignRefId: string | null;
  acquisitionAdSetRefId: string | null;
  acquisitionAdRefId: string | null;
}

@Injectable()
export class CrmAcquisitionService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

  private context() { return this.tenantContext.getContext(); }

  /**
   * Resolves a partial hierarchy to the complete canonical chain and verifies that every
   * referenced node belongs to the active tenant/company. Callers can safely persist the
   * returned IDs while keeping the lead's textual acquisition snapshot unchanged.
   */
  async resolveRefs(input: AcquisitionInput, tx: DbClient = this.prisma): Promise<ResolvedAcquisitionRefs> {
    const c = this.context();
    const requested = [
      input.acquisitionChannelId,
      input.acquisitionSourceId,
      input.acquisitionCampaignRefId,
      input.acquisitionAdSetRefId,
      input.acquisitionAdRefId,
    ];
    if (!requested.some((value) => value !== undefined && value !== null)) {
      return {
        acquisitionChannelId: input.acquisitionChannelId ?? null,
        acquisitionSourceId: input.acquisitionSourceId ?? null,
        acquisitionCampaignRefId: input.acquisitionCampaignRefId ?? null,
        acquisitionAdSetRefId: input.acquisitionAdSetRefId ?? null,
        acquisitionAdRefId: input.acquisitionAdRefId ?? null,
      };
    }

    const rows = await tx.$queryRawUnsafe<Array<ResolvedAcquisitionRefs>>(`
      WITH selected AS (
        SELECT
          $3::uuid AS requested_channel_id,
          $4::uuid AS requested_source_id,
          $5::uuid AS requested_campaign_id,
          $6::uuid AS requested_ad_set_id,
          $7::uuid AS requested_ad_id
      ), chain AS (
        SELECT
          COALESCE(ch.id, src_ch.id, cmp_ch.id, aset_ch.id, ad_ch.id) AS "acquisitionChannelId",
          COALESCE(src.id, cmp_src.id, aset_src.id, ad_src.id) AS "acquisitionSourceId",
          COALESCE(cmp.id, aset_cmp.id, ad_cmp.id) AS "acquisitionCampaignRefId",
          COALESCE(aset.id, ad_aset.id) AS "acquisitionAdSetRefId",
          ad.id AS "acquisitionAdRefId",
          s.*
        FROM selected s
        LEFT JOIN crm_acquisition_channels ch ON ch.id=s.requested_channel_id AND ch.tenant_id=$1::text AND ch.company_id=$2::text
        LEFT JOIN crm_acquisition_sources src ON src.id=s.requested_source_id AND src.tenant_id=$1::text AND src.company_id=$2::text
        LEFT JOIN crm_acquisition_channels src_ch ON src_ch.id=src.channel_id
        LEFT JOIN crm_acquisition_campaigns cmp ON cmp.id=s.requested_campaign_id AND cmp.tenant_id=$1::text AND cmp.company_id=$2::text
        LEFT JOIN crm_acquisition_sources cmp_src ON cmp_src.id=cmp.source_id
        LEFT JOIN crm_acquisition_channels cmp_ch ON cmp_ch.id=cmp_src.channel_id
        LEFT JOIN crm_acquisition_ad_sets aset ON aset.id=s.requested_ad_set_id AND aset.tenant_id=$1::text AND aset.company_id=$2::text
        LEFT JOIN crm_acquisition_campaigns aset_cmp ON aset_cmp.id=aset.campaign_id
        LEFT JOIN crm_acquisition_sources aset_src ON aset_src.id=aset_cmp.source_id
        LEFT JOIN crm_acquisition_channels aset_ch ON aset_ch.id=aset_src.channel_id
        LEFT JOIN crm_acquisition_ads ad ON ad.id=s.requested_ad_id AND ad.tenant_id=$1::text AND ad.company_id=$2::text
        LEFT JOIN crm_acquisition_ad_sets ad_aset ON ad_aset.id=ad.ad_set_id
        LEFT JOIN crm_acquisition_campaigns ad_cmp ON ad_cmp.id=ad_aset.campaign_id
        LEFT JOIN crm_acquisition_sources ad_src ON ad_src.id=ad_cmp.source_id
        LEFT JOIN crm_acquisition_channels ad_ch ON ad_ch.id=ad_src.channel_id
      )
      SELECT "acquisitionChannelId","acquisitionSourceId","acquisitionCampaignRefId","acquisitionAdSetRefId","acquisitionAdRefId"
      FROM chain
      WHERE (requested_channel_id IS NULL OR "acquisitionChannelId"=requested_channel_id)
        AND (requested_source_id IS NULL OR "acquisitionSourceId"=requested_source_id)
        AND (requested_campaign_id IS NULL OR "acquisitionCampaignRefId"=requested_campaign_id)
        AND (requested_ad_set_id IS NULL OR "acquisitionAdSetRefId"=requested_ad_set_id)
        AND (requested_ad_id IS NULL OR "acquisitionAdRefId"=requested_ad_id)
      LIMIT 1
    `, c.tenantId, c.companyId,
      input.acquisitionChannelId ?? null,
      input.acquisitionSourceId ?? null,
      input.acquisitionCampaignRefId ?? null,
      input.acquisitionAdSetRefId ?? null,
      input.acquisitionAdRefId ?? null,
    );

    if (!rows.length) {
      throw new BadRequestException('Acquisition references are outside the active company or do not form one hierarchy.');
    }
    return rows[0];
  }
}
