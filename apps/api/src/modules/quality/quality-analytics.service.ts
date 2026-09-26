import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualityAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async recurringFindings(input: { days?: number; minOccurrences?: number; limit?: number }) {
    const c = this.context();
    const days = Math.min(Math.max(input.days ?? 90, 7), 3650);
    const minOccurrences = Math.min(Math.max(input.minOccurrences ?? 2, 2), 100);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH grouped AS (
         SELECT f.branch_id,
                f.category,
                f.severity,
                COUNT(*)::int AS occurrences,
                COUNT(*) FILTER (WHERE f.status <> 'CLOSED')::int AS open_count,
                COUNT(*) FILTER (WHERE f.quality_case_id IS NOT NULL)::int AS escalated_count,
                MIN(f.created_at) AS first_seen_at,
                MAX(f.created_at) AS last_seen_at,
                ARRAY_AGG(f.id ORDER BY f.created_at DESC) AS finding_ids
         FROM quality_findings f
         WHERE f.tenant_id=$1::text AND f.company_id=$2::text
           AND ($3::text IS NULL OR f.branch_id=$3::text)
           AND f.created_at >= now() - ($4::int * interval '1 day')
         GROUP BY f.branch_id,f.category,f.severity
         HAVING COUNT(*) >= $5::int
       )
       SELECT g.branch_id AS "branchId",b.name AS "branchName",g.category,g.severity,
              g.occurrences,g.open_count AS "openCount",g.escalated_count AS "escalatedCount",
              g.first_seen_at AS "firstSeenAt",g.last_seen_at AS "lastSeenAt",
              g.finding_ids[1:10] AS "recentFindingIds",
              ROUND((g.occurrences::numeric / GREATEST($4::numeric,1))*30,2) AS "monthlyFrequency"
       FROM grouped g JOIN branches b ON b.id=g.branch_id
       ORDER BY g.occurrences DESC,g.last_seen_at DESC
       LIMIT $6`,
      c.tenantId,c.companyId,c.branchId,days,minOccurrences,limit,
    );
  }

  async rootCausePatterns(input: { days?: number; minOccurrences?: number; limit?: number }) {
    const c = this.context();
    const days = Math.min(Math.max(input.days ?? 180, 7), 3650);
    const minOccurrences = Math.min(Math.max(input.minOccurrences ?? 2, 2), 100);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH normalized AS (
         SELECT p.branch_id,p.id,p.status,p.quality_case_id,p.finding_id,
                regexp_replace(lower(trim(p.root_cause)),'\\s+',' ','g') AS root_cause_key,
                trim(p.root_cause) AS root_cause,
                p.created_at
         FROM quality_capa_plans p
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text
           AND ($3::text IS NULL OR p.branch_id=$3::text)
           AND p.created_at >= now() - ($4::int * interval '1 day')
           AND nullif(trim(p.root_cause),'') IS NOT NULL
       ), grouped AS (
         SELECT branch_id,root_cause_key,MIN(root_cause) AS sample_root_cause,
                COUNT(*)::int AS occurrences,
                COUNT(*) FILTER (WHERE status='INEFFECTIVE')::int AS ineffective_count,
                COUNT(*) FILTER (WHERE status='EFFECTIVE' OR status='CLOSED')::int AS effective_count,
                MAX(created_at) AS last_seen_at,
                ARRAY_AGG(id ORDER BY created_at DESC) AS capa_ids
         FROM normalized GROUP BY branch_id,root_cause_key HAVING COUNT(*) >= $5::int
       )
       SELECT g.branch_id AS "branchId",b.name AS "branchName",g.root_cause_key AS "rootCauseKey",
              g.sample_root_cause AS "sampleRootCause",g.occurrences,
              g.ineffective_count AS "ineffectiveCount",g.effective_count AS "effectiveCount",
              g.last_seen_at AS "lastSeenAt",g.capa_ids[1:10] AS "recentCapaIds"
       FROM grouped g JOIN branches b ON b.id=g.branch_id
       ORDER BY g.occurrences DESC,g.last_seen_at DESC LIMIT $6`,
      c.tenantId,c.companyId,c.branchId,days,minOccurrences,limit,
    );
  }

  async branchSignals(days = 90) {
    const c = this.context();
    const windowDays = Math.min(Math.max(days, 7), 3650);
    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH findings AS (
         SELECT f.branch_id,
                COUNT(*)::int AS finding_count,
                COUNT(*) FILTER (WHERE f.severity IN ('HIGH','CRITICAL'))::int AS high_risk_findings,
                COUNT(*) FILTER (WHERE f.status <> 'CLOSED')::int AS open_findings
         FROM quality_findings f
         WHERE f.tenant_id=$1::text AND f.company_id=$2::text
           AND ($3::text IS NULL OR f.branch_id=$3::text)
           AND f.created_at >= now() - ($4::int * interval '1 day')
         GROUP BY f.branch_id
       ), capas AS (
         SELECT p.branch_id,
                COUNT(*)::int AS capa_count,
                COUNT(*) FILTER (WHERE p.status='INEFFECTIVE')::int AS ineffective_capas
         FROM quality_capa_plans p
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text
           AND ($3::text IS NULL OR p.branch_id=$3::text)
           AND p.created_at >= now() - ($4::int * interval '1 day')
         GROUP BY p.branch_id
       ), inspections AS (
         SELECT q.branch_id,
                COUNT(*)::int AS completed_inspections,
                ROUND(AVG(q.score)::numeric,2) AS average_inspection_score
         FROM quality_inspections q
         WHERE q.tenant_id=$1::text AND q.company_id=$2::text
           AND ($3::text IS NULL OR q.branch_id=$3::text)
           AND q.status='COMPLETED'
           AND q.completed_at >= now() - ($4::int * interval '1 day')
         GROUP BY q.branch_id
       )
       SELECT b.id AS "branchId",b.name AS "branchName",
              COALESCE(f.finding_count,0)::int AS "findingCount",
              COALESCE(f.high_risk_findings,0)::int AS "highRiskFindings",
              COALESCE(f.open_findings,0)::int AS "openFindings",
              COALESCE(p.capa_count,0)::int AS "capaCount",
              COALESCE(p.ineffective_capas,0)::int AS "ineffectiveCapas",
              COALESCE(q.completed_inspections,0)::int AS "completedInspections",
              q.average_inspection_score AS "averageInspectionScore"
       FROM branches b
       JOIN companies co ON co.id=b."companyId" AND co.id=$2::text AND co."tenantId"=$1::text
       LEFT JOIN findings f ON f.branch_id=b.id
       LEFT JOIN capas p ON p.branch_id=b.id
       LEFT JOIN inspections q ON q.branch_id=b.id
       WHERE ($3::text IS NULL OR b.id=$3::text)
       ORDER BY "highRiskFindings" DESC,"findingCount" DESC,b.name`,
      c.tenantId,c.companyId,c.branchId,windowDays,
    );
  }
}
