import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface LeadScoringPolicyInput {
  warmMin: number;
  hotMin: number;
  version: number;
}

export interface LeadScoreOverrideInput {
  score: number;
  temperature: 'COLD' | 'WARM' | 'HOT';
  reason: string;
  version: number;
}

@Injectable()
export class CrmLeadScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private requireBranchId() {
    const branchId = this.context().branchId;
    if (!branchId) throw new BadRequestException('CRM scoring mutation requires an active branch.');
    return branchId;
  }

  async getPolicy() {
    const { tenantId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      warmMin: number;
      hotMin: number;
      version: number;
      updatedAt: Date;
    }>>(
      `SELECT warm_min AS "warmMin",hot_min AS "hotMin",version,updated_at AS "updatedAt"
       FROM crm_lead_scoring_policies WHERE tenant_id=$1::text LIMIT 1`,
      tenantId,
    );
    return rows[0] ?? { warmMin: 50, hotMin: 80, version: 0, updatedAt: null };
  }

  async updatePolicy(input: LeadScoringPolicyInput, actorUserId: string) {
    const context = this.context();
    if (input.warmMin >= input.hotMin) {
      throw new BadRequestException('Warm threshold must be lower than hot threshold.');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{
        warmMin: number;
        hotMin: number;
        version: number;
        updatedAt: Date;
      }>>(
        `INSERT INTO crm_lead_scoring_policies(tenant_id,warm_min,hot_min,version,updated_by_user_id,updated_at)
         VALUES($1::text,$2,$3,1,$4::text,NOW())
         ON CONFLICT(tenant_id) DO UPDATE SET
           warm_min=EXCLUDED.warm_min,hot_min=EXCLUDED.hot_min,
           version=crm_lead_scoring_policies.version+1,
           updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()
         WHERE crm_lead_scoring_policies.version=$5
         RETURNING warm_min AS "warmMin",hot_min AS "hotMin",version,updated_at AS "updatedAt"`,
        context.tenantId,
        input.warmMin,
        input.hotMin,
        actorUserId,
        input.version,
      );
      if (!rows.length) throw new ConflictException('Lead scoring policy changed. Refresh and retry.');

      await tx.$executeRawUnsafe(
        `UPDATE crm_leads SET customer_intent=customer_intent
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND lead_score_overridden=FALSE`,
        context.tenantId,
        context.companyId,
        context.branchId,
      );

      return rows[0];
    });
  }

  async getLeadScore(leadId: string) {
    const context = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id,lead_score AS "score",lead_temperature AS "temperature",
              lead_score_version AS "scoreVersion",lead_score_explanation AS "explanation",
              lead_score_overridden AS "overridden",lead_score_override_reason AS "overrideReason",
              lead_score_updated_at AS "updatedAt"
       FROM crm_leads
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      leadId,
      context.tenantId,
      context.companyId,
      context.branchId,
    );
    if (!rows.length) throw new NotFoundException('CRM lead not found.');
    return rows[0];
  }

  async listHistory(leadId: string, limit = 50) {
    const context = this.context();
    await this.getLeadScore(leadId);
    return this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id,score,temperature,score_version AS "scoreVersion",explanation,source,
              actor_user_id AS "actorUserId",reason,created_at AS "createdAt"
       FROM crm_lead_score_history
       WHERE lead_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       ORDER BY created_at DESC,id DESC LIMIT $5`,
      leadId,
      context.tenantId,
      context.companyId,
      context.branchId,
      Math.min(Math.max(limit, 1), 200),
    );
  }

  async overrideScore(leadId: string, input: LeadScoreOverrideInput, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE crm_leads SET
           lead_score=$5,lead_temperature=$6,lead_score_overridden=TRUE,
           lead_score_override_reason=$7,lead_score_explanation=jsonb_build_object(
             'engineVersion',1,'manualOverride',TRUE,'reason',$7::text
           ),lead_score_version=lead_score_version+1,lead_score_updated_at=NOW(),updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
           AND lead_score_version=$8
         RETURNING id,lead_score AS "score",lead_temperature AS "temperature",
                   lead_score_version AS "scoreVersion",lead_score_explanation AS "explanation",
                   lead_score_overridden AS "overridden",lead_score_override_reason AS "overrideReason",
                   lead_score_updated_at AS "updatedAt"`,
        leadId,
        context.tenantId,
        context.companyId,
        branchId,
        input.score,
        input.temperature,
        input.reason,
        input.version,
      );
      if (!rows.length) throw new ConflictException('Lead score changed or is outside the active scope.');

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_SCORE_OVERRIDDEN',$5::text,$6::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        leadId,
        actorUserId,
        JSON.stringify({
          score: input.score,
          temperature: input.temperature,
          reason: input.reason,
          scoreVersion: rows[0].scoreVersion,
        }),
      );
      return rows[0];
    });
  }

  async recalculate(leadId: string, actorUserId: string) {
    const context = this.context();
    const branchId = this.requireBranchId();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE crm_leads SET
           lead_score_overridden=FALSE,lead_score_override_reason=NULL,customer_intent=customer_intent,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
         RETURNING id,lead_score AS "score",lead_temperature AS "temperature",
                   lead_score_version AS "scoreVersion",lead_score_explanation AS "explanation",
                   lead_score_overridden AS "overridden",lead_score_updated_at AS "updatedAt"`,
        leadId,
        context.tenantId,
        context.companyId,
        branchId,
      );
      if (!rows.length) throw new NotFoundException('CRM lead not found.');

      await tx.$executeRawUnsafe(
        `INSERT INTO crm_events(tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'LEAD_SCORE_RECALCULATED',$5::text,$6::jsonb)`,
        context.tenantId,
        context.companyId,
        branchId,
        leadId,
        actorUserId,
        JSON.stringify({ scoreVersion: rows[0].scoreVersion }),
      );
      return rows[0];
    });
  }
}
