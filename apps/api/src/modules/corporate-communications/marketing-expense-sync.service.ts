import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class MarketingExpenseSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async syncCampaign(campaignId: string) {
    const { tenantId, companyId } = this.tenantContext.getContext();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_expenses(
         tenant_id,company_id,branch_id,source_type,source_id,period_key,campaign_id,
         category,description,amount,currency,incurred_on,status,expense_account_code,expense_account_name,metadata
       )
       SELECT c.tenant_id,c.company_id,c.branch_id,'CAMPAIGN',c.id,'LIFETIME',c.id,
              'AD_SPEND',c.name || ' reklam harcaması',c.spent_amount,c.currency,CURRENT_DATE,
              'PENDING_FINANCE','760.01','Dijital Reklam Giderleri',
              jsonb_build_object('channel',c.channel,'autoSynced',true)
       FROM corporate_communication_campaigns c
       WHERE c.id=$1::text AND c.tenant_id=$2::text AND c.company_id=$3::text AND c.spent_amount>0
       ON CONFLICT (tenant_id,company_id,source_type,source_id,period_key)
       DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,branch_id=EXCLUDED.branch_id,
                     description=EXCLUDED.description,metadata=EXCLUDED.metadata,updated_at=NOW()
       WHERE corporate_marketing_expenses.status='PENDING_FINANCE'`,
      campaignId,
      tenantId,
      companyId,
    );
  }
}
