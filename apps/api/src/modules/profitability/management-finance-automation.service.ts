import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { FinancialHealthHistoryService } from './financial-health-history.service';
import { CfoDashboardQuery } from './cfo-dashboard.service';

export interface ManagementActionPolicyInput {
  criticalHours?: number;
  highHours?: number;
  mediumHours?: number;
  lowHours?: number;
  escalationGraceHours?: number;
}

@Injectable()
export class ManagementFinanceAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly history: FinancialHealthHistoryService,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private hoursFor(priority: string, policy: any) {
    switch (priority) {
      case 'CRITICAL': return Number(policy.criticalHours);
      case 'HIGH': return Number(policy.highHours);
      case 'LOW': return Number(policy.lowHours);
      default: return Number(policy.mediumHours);
    }
  }

  async getPolicy() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,critical_hours AS "criticalHours",high_hours AS "highHours",
              medium_hours AS "mediumHours",low_hours AS "lowHours",
              escalation_grace_hours AS "escalationGraceHours",updated_at AS "updatedAt"
       FROM management_finance_action_policies
       WHERE company_id=$1::text AND COALESCE(branch_id,'')=COALESCE($2::text,'') LIMIT 1`,
      companyId, branchId,
    );
    return rows[0] ?? {
      criticalHours: 24,
      highHours: 72,
      mediumHours: 168,
      lowHours: 336,
      escalationGraceHours: 24,
      configured: false,
    };
  }

  async setPolicy(input: ManagementActionPolicyInput) {
    const current = await this.getPolicy();
    const values = {
      criticalHours: Number(input.criticalHours ?? current.criticalHours),
      highHours: Number(input.highHours ?? current.highHours),
      mediumHours: Number(input.mediumHours ?? current.mediumHours),
      lowHours: Number(input.lowHours ?? current.lowHours),
      escalationGraceHours: Number(input.escalationGraceHours ?? current.escalationGraceHours),
    };
    for (const [key, value] of Object.entries(values)) {
      if (!Number.isInteger(value) || value <= 0 || value > 8760) {
        throw new BadRequestException(`${key} must be an integer between 1 and 8760.`);
      }
    }
    const { tenantId, companyId, branchId } = this.context();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO management_finance_action_policies(
         id,tenant_id,company_id,branch_id,critical_hours,high_hours,medium_hours,low_hours,escalation_grace_hours
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9)
       ON CONFLICT(company_id,(COALESCE(branch_id,''))) DO UPDATE SET
         critical_hours=EXCLUDED.critical_hours,high_hours=EXCLUDED.high_hours,
         medium_hours=EXCLUDED.medium_hours,low_hours=EXCLUDED.low_hours,
         escalation_grace_hours=EXCLUDED.escalation_grace_hours,updated_at=NOW()`,
      current.id ?? randomUUID(), tenantId, companyId, branchId,
      values.criticalHours, values.highHours, values.mediumHours, values.lowHours,
      values.escalationGraceHours,
    );
    return { ...(await this.getPolicy()), configured: true };
  }

  async syncRecommendations(query: CfoDashboardQuery = {}) {
    const { tenantId, companyId, branchId } = this.context();
    const [recommendationResult, policy] = await Promise.all([
      this.history.recommendations(query),
      this.getPolicy(),
    ]);
    let created = 0;
    let refreshed = 0;

    for (const recommendation of recommendationResult.recommendations) {
      const priority = recommendation.priority;
      const dueAt = new Date(recommendationResult.asOf);
      dueAt.setUTCHours(dueAt.getUTCHours() + this.hoursFor(priority, policy));
      const sourceType = 'FINANCIAL_HEALTH_RECOMMENDATION';
      const title = recommendation.action.replaceAll('_', ' ');

      const inserted = await this.prisma.$executeRawUnsafe(
        `INSERT INTO management_finance_actions(
           id,tenant_id,company_id,branch_id,source_code,source_type,title,description,
           priority,status,due_at,auto_generated,created_at,updated_at
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,'OPEN',$10::timestamptz,TRUE,NOW(),NOW())
         ON CONFLICT DO NOTHING`,
        randomUUID(), tenantId, companyId, branchId, recommendation.code, sourceType,
        title, recommendation.recommendation, priority, dueAt,
      );

      if (Number(inserted) > 0) {
        created += 1;
      } else {
        await this.prisma.$executeRawUnsafe(
          `UPDATE management_finance_actions SET
             title=$5,description=$6,priority=$7,due_at=LEAST(COALESCE(due_at,$8::timestamptz),$8::timestamptz),updated_at=NOW()
           WHERE company_id=$1::text AND COALESCE(branch_id,'')=COALESCE($2::text,'')
             AND source_type=$3 AND source_code=$4
             AND auto_generated=TRUE AND status IN ('OPEN','IN_PROGRESS','BLOCKED')`,
          companyId, branchId, sourceType, recommendation.code, title,
          recommendation.recommendation, priority, dueAt,
        );
        refreshed += 1;
      }
    }

    return {
      asOf: recommendationResult.asOf,
      recommendationCount: recommendationResult.recommendationCount,
      created,
      refreshed,
    };
  }

  async escalateOverdue(asOf = new Date()) {
    const { companyId, branchId } = this.context();
    const policy = await this.getPolicy();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE management_finance_actions SET
         priority=CASE priority
           WHEN 'LOW' THEN 'MEDIUM'
           WHEN 'MEDIUM' THEN 'HIGH'
           ELSE 'CRITICAL'
         END,
         escalation_level=escalation_level+1,
         last_escalated_at=$3::timestamptz,
         updated_at=NOW()
       WHERE company_id=$1::text
         AND ($2::text IS NULL OR branch_id=$2::text)
         AND status IN ('OPEN','IN_PROGRESS','BLOCKED')
         AND due_at IS NOT NULL AND due_at<$3::timestamptz
         AND (last_escalated_at IS NULL OR last_escalated_at <= $3::timestamptz - ($4::int * INTERVAL '1 hour'))
       RETURNING id,source_code AS "sourceCode",priority,escalation_level AS "escalationLevel",
                 due_at AS "dueAt",last_escalated_at AS "lastEscalatedAt"`,
      companyId, branchId, asOf, Number(policy.escalationGraceHours),
    );
    return { asOf, escalatedCount: rows.length, actions: rows };
  }

  async slaSummary(asOf = new Date()) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','BLOCKED'))::int AS open,
         COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','BLOCKED') AND due_at<$3::timestamptz)::int AS overdue,
         COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','BLOCKED') AND priority='CRITICAL')::int AS critical,
         COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','BLOCKED') AND due_at BETWEEN $3::timestamptz AND $3::timestamptz + INTERVAL '24 hours')::int AS due_next_24h,
         COALESCE(MAX(escalation_level),0)::int AS max_escalation_level
       FROM management_finance_actions
       WHERE company_id=$1::text AND ($2::text IS NULL OR branch_id=$2::text)`,
      companyId, branchId, asOf,
    );
    const row = rows[0] ?? {};
    return {
      asOf,
      open: Number(row.open ?? 0),
      overdue: Number(row.overdue ?? 0),
      critical: Number(row.critical ?? 0),
      dueNext24Hours: Number(row.due_next_24h ?? 0),
      maxEscalationLevel: Number(row.max_escalation_level ?? 0),
    };
  }
}
