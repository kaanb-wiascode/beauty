import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import type { CrmAutomationScope } from './crm-automation.service';

type LeadScoreRow = {
  id: string;
  phone: string | null;
  alternativePhone: string | null;
  email: string | null;
  estimatedBudget: number | null;
  purchaseUrgency: string | null;
  consultationNeed: string | null;
  customerIntent: string | null;
  interactionCount: number;
  positiveInteractionCount: number;
  appointmentCount: number;
  completedAppointmentCount: number;
  noShowCount: number;
  acceptedQuoteCount: number;
  viewedQuoteCount: number;
  rejectedQuoteCount: number;
  overdueFollowUpCount: number;
};

@Injectable()
export class CrmLeadScoringService {
  constructor(private readonly prisma: PrismaService) {}

  private calculate(row: LeadScoreRow) {
    const components: Record<string, number> = {};

    if (row.phone || row.alternativePhone) components.telefon = 5;
    if (row.email) components.eposta = 5;
    if (row.estimatedBudget != null) components.butce = 10;

    const urgencyScore: Record<string, number> = {
      IMMEDIATE: 15,
      THIS_WEEK: 10,
      THIS_MONTH: 5,
      LATER: 0,
      UNKNOWN: 0,
    };
    components.satinAlmaAciliyeti = urgencyScore[row.purchaseUrgency ?? 'UNKNOWN'] ?? 0;

    if (row.consultationNeed === 'REQUESTED' || row.consultationNeed === 'REQUIRED') {
      components.danismaTalebi = 5;
    }
    if (row.customerIntent?.trim()) components.musteriNiyeti = 5;

    components.gorusmeler = Math.min(row.interactionCount * 3, 15);
    components.olumluGorusmeler = Math.min(row.positiveInteractionCount * 5, 15);
    components.randevular = Math.min(row.appointmentCount * 4, 12);
    components.tamamlananRandevular = Math.min(row.completedAppointmentCount * 8, 16);
    components.gelinmeyenRandevular = -Math.min(row.noShowCount * 12, 24);
    components.goruntulenenTeklif = Math.min(row.viewedQuoteCount * 8, 16);
    components.kabulEdilenTeklif = Math.min(row.acceptedQuoteCount * 25, 25);
    components.reddedilenTeklif = -Math.min(row.rejectedQuoteCount * 12, 24);
    components.gecikenTakip = -Math.min(row.overdueFollowUpCount * 5, 20);

    const raw = Object.values(components).reduce((sum, value) => sum + value, 0);
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const temperature = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';

    return { score, temperature, components };
  }

  async recalculateLead(scope: CrmAutomationScope, leadId: string) {
    const rows = await this.prisma.$queryRawUnsafe<LeadScoreRow[]>(
      `SELECT l.id,l.phone,l.alternative_phone AS "alternativePhone",l.email,
              l.estimated_budget::float8 AS "estimatedBudget",l.purchase_urgency AS "purchaseUrgency",
              l.consultation_need AS "consultationNeed",l.customer_intent AS "customerIntent",
              (SELECT COUNT(*)::int FROM crm_interactions i WHERE i.lead_id=l.id) AS "interactionCount",
              (SELECT COUNT(*)::int FROM crm_interactions i WHERE i.lead_id=l.id AND i.status='COMPLETED'
                 AND lower(COALESCE(i.result,'')) ~ '(ilgilen|teklif|randevu|olumlu|satın|kabul)') AS "positiveInteractionCount",
              (SELECT COUNT(*)::int FROM appointments a WHERE a."customerId"=l.customer_id) AS "appointmentCount",
              (SELECT COUNT(*)::int FROM appointments a WHERE a."customerId"=l.customer_id AND a.status='COMPLETED') AS "completedAppointmentCount",
              (SELECT COUNT(*)::int FROM appointments a WHERE a."customerId"=l.customer_id AND a.status='NO_SHOW') AS "noShowCount",
              (SELECT COUNT(*)::int FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id
                 WHERE o.lead_id=l.id AND q.status='ACCEPTED') AS "acceptedQuoteCount",
              (SELECT COUNT(*)::int FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id
                 WHERE o.lead_id=l.id AND q.status='VIEWED') AS "viewedQuoteCount",
              (SELECT COUNT(*)::int FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id
                 WHERE o.lead_id=l.id AND q.status='REJECTED') AS "rejectedQuoteCount",
              (SELECT COUNT(*)::int FROM crm_follow_ups f WHERE f.lead_id=l.id AND f.status='OPEN' AND f.due_at<NOW()) AS "overdueFollowUpCount"
         FROM crm_leads l
        WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
          AND ($4::text IS NULL OR l.branch_id=$4::text)
        LIMIT 1`,
      leadId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    const row = rows[0];
    if (!row) return null;

    const result = this.calculate(row);
    await this.prisma.$executeRawUnsafe(
      `UPDATE crm_leads
          SET lead_score=$5,lead_temperature=$6,
              lead_score_breakdown=$7::jsonb,lead_score_updated_at=NOW(),updated_at=NOW()
        WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND ($4::text IS NULL OR branch_id=$4::text)`,
      leadId,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
      result.score,
      result.temperature,
      JSON.stringify(result.components),
    );
    return result;
  }

  async sweep(scope: CrmAutomationScope) {
    const leads = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM crm_leads
        WHERE tenant_id=$1::text AND company_id=$2::text
          AND ($3::text IS NULL OR branch_id=$3::text)
          AND status NOT IN ('LOST','CONVERTED')
        ORDER BY COALESCE(lead_score_updated_at,'1970-01-01'::timestamptz),updated_at
        LIMIT 200`,
      scope.tenantId,
      scope.companyId,
      scope.branchId,
    );
    let updated = 0;
    for (const lead of leads) {
      if (await this.recalculateLead(scope, lead.id)) updated += 1;
    }
    return { scanned: leads.length, updated };
  }
}
