import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class QualityBranchScoreAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async latest() {
    const { tenantId, companyId, branchId } = this.tenant.getContext();

    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH latest AS (
         SELECT DISTINCT ON (s.branch_id)
                s.branch_id,s.final_score,s.inspection_score,s.finding_penalty,
                s.period_start,s.period_end,s.calculated_at,s.latest_run_id
         FROM branch_quality_scores s
         WHERE s.tenant_id=$1::text AND s.company_id=$2::text
           AND ($3::text IS NULL OR s.branch_id=$3::text)
         ORDER BY s.branch_id,s.period_end DESC,s.calculated_at DESC
       ), compliance AS (
         SELECT d.run_id,d.raw_score,d.source_count
         FROM branch_quality_score_dimension_runs d
         WHERE d.tenant_id=$1::text AND d.company_id=$2::text
           AND ($3::text IS NULL OR d.branch_id=$3::text)
           AND d.source_kind='TRAINING_COMPLIANCE'
       )
       SELECT b.id AS "branchId",b.name AS "branchName",b.code AS "branchCode",
              l.final_score AS "finalScore",l.inspection_score AS "baseScore",
              l.finding_penalty AS "findingPenalty",l.period_start AS "periodStart",
              l.period_end AS "periodEnd",l.calculated_at AS "calculatedAt",
              c.raw_score AS "trainingCompliance",c.source_count AS "trainingSourceCount"
       FROM branches b
       JOIN companies company ON company.id=b."companyId"
         AND company.id=$2::text AND company."tenantId"=$1::text
       LEFT JOIN latest l ON l.branch_id=b.id
       LEFT JOIN compliance c ON c.run_id=l.latest_run_id
       WHERE b.status='ACTIVE' AND ($3::text IS NULL OR b.id=$3::text)
       ORDER BY l.final_score DESC NULLS LAST,b.name`,
      tenantId,
      companyId,
      branchId,
    );
  }
}
