import { Injectable } from '@nestjs/common';
import { Prisma } from '@beauty-erp/database';

type AttributionScope = {
  tenantId: string;
  companyId: string;
  branchId: string;
};

@Injectable()
export class MarketingAttributionService {
  async linkSaleFromOpportunity(
    tx: Prisma.TransactionClient,
    opportunityId: string,
    saleId: string,
    scope: AttributionScope,
  ) {
    const rows = await tx.$queryRawUnsafe<Array<{
      marketingLeadId: string;
      campaignId: string | null;
      provider: string;
    }>>(
      `UPDATE corporate_marketing_leads ml
       SET sale_id=$1::text,status='WON',updated_at=now()
       FROM crm_opportunities o
       WHERE o.id=$2::text
         AND o.tenant_id=$3::text AND o.company_id=$4::text AND o.branch_id=$5::text
         AND ml.crm_lead_id=o.lead_id
         AND ml.tenant_id=$3::text AND ml.company_id=$4::text AND ml.branch_id=$5::text
         AND (ml.sale_id IS NULL OR ml.sale_id=$1::text)
       RETURNING ml.id AS "marketingLeadId",ml.campaign_id AS "campaignId",ml.provider`,
      saleId,
      opportunityId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );

    for (const row of rows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_touchpoints(
           tenant_id,company_id,marketing_lead_id,campaign_id,provider,touch_type,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,'SALE_CREATED',$6::jsonb)`,
        scope.tenantId,
        scope.companyId,
        row.marketingLeadId,
        row.campaignId,
        row.provider,
        JSON.stringify({ opportunityId, saleId }),
      );
    }
  }

  async refreshCollectedRevenue(
    tx: Prisma.TransactionClient,
    saleId: string,
    scope: AttributionScope,
    event: 'PAYMENT_COMPLETED' | 'PAYMENT_REFUNDED',
    paymentId: string,
  ) {
    const payments = await tx.salePayment.aggregate({
      where: {
        saleId,
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        status: 'COMPLETED',
      },
      _sum: { amount: true },
    });
    const revenueAmount = Number(payments._sum.amount ?? 0);

    const rows = await tx.$queryRawUnsafe<Array<{
      marketingLeadId: string;
      campaignId: string | null;
      provider: string;
    }>>(
      `UPDATE corporate_marketing_leads
       SET revenue_amount=$1,updated_at=now()
       WHERE tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
         AND sale_id=$5::text
       RETURNING id AS "marketingLeadId",campaign_id AS "campaignId",provider`,
      revenueAmount,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      saleId,
    );

    for (const row of rows) {
      await tx.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_touchpoints(
           tenant_id,company_id,marketing_lead_id,campaign_id,provider,touch_type,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7::jsonb)`,
        scope.tenantId,
        scope.companyId,
        row.marketingLeadId,
        row.campaignId,
        row.provider,
        event,
        JSON.stringify({ saleId, paymentId, revenueAmount }),
      );
    }
  }
}
