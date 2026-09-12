import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private scope() {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    return { tenantId, companyId, branchId };
  }

  async overview(days = 90) {
    const c = this.scope();
    const windowDays = Math.min(Math.max(Number.isFinite(days) ? days : 90, 7), 3650);

    const [assignmentRows, reviewRows, competencyRows, complianceTrend] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE a.status='COMPLETED')::int AS completed,
                COUNT(*) FILTER (WHERE a.status IN ('ASSIGNED','IN_PROGRESS'))::int AS open,
                COUNT(*) FILTER (WHERE a.status='EXPIRED')::int AS expired,
                COUNT(*) FILTER (
                  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
                    AND a.due_at IS NOT NULL
                    AND a.due_at < NOW()
                )::int AS overdue,
                ROUND((100.0 * COUNT(*) FILTER (WHERE a.status='COMPLETED') / NULLIF(COUNT(*),0))::numeric,2) AS completion_rate
         FROM training_assignments a
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text
           AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND a.assigned_at >= NOW()-($4::int*INTERVAL '1 day')`,
        c.tenantId,
        c.companyId,
        c.branchId,
        windowDays,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) FILTER (WHERE r.status='OPEN')::int AS open,
                COUNT(*) FILTER (WHERE r.status='OPEN' AND r.due_at<NOW())::int AS overdue,
                COUNT(*) FILTER (
                  WHERE r.status='COMPLETED'
                    AND r.completed_at>=NOW()-($4::int*INTERVAL '1 day')
                )::int AS completed
         FROM competency_reviews r
         WHERE r.tenant_id=$1::text AND r.company_id=$2::text
           AND ($3::text IS NULL OR r.branch_id=$3::text)`,
        c.tenantId,
        c.companyId,
        c.branchId,
        windowDays,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `WITH active_profiles AS (
           SELECT DISTINCT ON (scp.staff_id)
                  scp.staff_id,scp.branch_id,scp.profile_id
           FROM staff_competency_profiles scp
           WHERE scp.tenant_id=$1::text AND scp.company_id=$2::text
             AND ($3::text IS NULL OR scp.branch_id=$3::text)
             AND scp.effective_from<=CURRENT_DATE
             AND (scp.effective_to IS NULL OR scp.effective_to>=CURRENT_DATE)
           ORDER BY scp.staff_id,scp.effective_from DESC,scp.created_at DESC
         ), required AS (
           SELECT ap.staff_id,ap.branch_id,r.competency_id,r.required_level
           FROM active_profiles ap
           JOIN competency_profile_requirements r ON r.profile_id=ap.profile_id
         ), latest AS (
           SELECT req.staff_id,req.branch_id,req.competency_id,req.required_level,
                  assessment.score
           FROM required req
           LEFT JOIN LATERAL (
             SELECT a.score
             FROM staff_competency_assessments a
             WHERE a.tenant_id=$1::text AND a.company_id=$2::text
               AND a.branch_id=req.branch_id AND a.staff_id=req.staff_id
               AND a.competency_id=req.competency_id
             ORDER BY a.assessed_at DESC,a.created_at DESC
             LIMIT 1
           ) assessment ON true
         )
         SELECT COUNT(*)::int AS requirements,
                COUNT(*) FILTER (WHERE score IS NULL OR score<required_level)::int AS gaps,
                COUNT(DISTINCT staff_id)::int AS profiled_staff,
                ROUND(AVG(score)::numeric,2) AS average_score
         FROM latest`,
        c.tenantId,
        c.companyId,
        c.branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT s.period_start AS "periodStart",s.period_end AS "periodEnd",
                d.raw_score AS "trainingCompliance",s.final_score AS "qualityScore",
                d.source_count AS "sourceCount"
         FROM branch_quality_scores s
         JOIN branch_quality_score_dimension_runs d
           ON d.run_id=s.latest_run_id
          AND d.dimension_code IN (
            SELECT dimension_code
            FROM branch_quality_score_dimension_runs x
            WHERE x.run_id=s.latest_run_id AND x.source_kind='TRAINING_COMPLIANCE'
          )
         WHERE s.tenant_id=$1::text AND s.company_id=$2::text
           AND ($3::text IS NULL OR s.branch_id=$3::text)
           AND d.source_kind='TRAINING_COMPLIANCE'
         ORDER BY s.period_start DESC,s.calculated_at DESC
         LIMIT 12`,
        c.tenantId,
        c.companyId,
        c.branchId,
      ),
    ]);

    const assignments = assignmentRows[0] ?? {};
    const reviews = reviewRows[0] ?? {};
    const competency = competencyRows[0] ?? {};

    return {
      windowDays,
      assignments: {
        total: Number(assignments.total ?? 0),
        completed: Number(assignments.completed ?? 0),
        open: Number(assignments.open ?? 0),
        expired: Number(assignments.expired ?? 0),
        overdue: Number(assignments.overdue ?? 0),
        completionRate: assignments.completion_rate == null ? null : Number(assignments.completion_rate),
      },
      reviews: {
        open: Number(reviews.open ?? 0),
        overdue: Number(reviews.overdue ?? 0),
        completed: Number(reviews.completed ?? 0),
      },
      competency: {
        requirements: Number(competency.requirements ?? 0),
        gaps: Number(competency.gaps ?? 0),
        profiledStaff: Number(competency.profiled_staff ?? 0),
        averageScore: competency.average_score == null ? null : Number(competency.average_score),
      },
      complianceTrend,
    };
  }

  async staffRisk(limit = 25) {
    const c = this.scope();
    const bounded = Math.min(Math.max(Number.isFinite(limit) ? limit : 25, 1), 100);
    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH active_profiles AS (
         SELECT DISTINCT ON (scp.staff_id)
                scp.staff_id,scp.branch_id,scp.profile_id
         FROM staff_competency_profiles scp
         WHERE scp.tenant_id=$1::text AND scp.company_id=$2::text
           AND ($3::text IS NULL OR scp.branch_id=$3::text)
           AND scp.effective_from<=CURRENT_DATE
           AND (scp.effective_to IS NULL OR scp.effective_to>=CURRENT_DATE)
         ORDER BY scp.staff_id,scp.effective_from DESC,scp.created_at DESC
       ), gap_summary AS (
         SELECT ap.staff_id,ap.branch_id,
                COUNT(r.competency_id)::int AS requirements,
                COUNT(r.competency_id) FILTER (
                  WHERE latest.score IS NULL OR latest.score<r.required_level
                )::int AS gaps
         FROM active_profiles ap
         JOIN competency_profile_requirements r ON r.profile_id=ap.profile_id
         LEFT JOIN LATERAL (
           SELECT a.score
           FROM staff_competency_assessments a
           WHERE a.tenant_id=$1::text AND a.company_id=$2::text
             AND a.branch_id=ap.branch_id AND a.staff_id=ap.staff_id
             AND a.competency_id=r.competency_id
           ORDER BY a.assessed_at DESC,a.created_at DESC
           LIMIT 1
         ) latest ON true
         GROUP BY ap.staff_id,ap.branch_id
       ), training AS (
         SELECT a.staff_id,
                COUNT(*) FILTER (WHERE a.status IN ('ASSIGNED','IN_PROGRESS'))::int AS open_assignments,
                COUNT(*) FILTER (
                  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
                    AND a.due_at IS NOT NULL AND a.due_at<NOW()
                )::int AS overdue_assignments
         FROM training_assignments a
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text
           AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND a.staff_id IS NOT NULL
         GROUP BY a.staff_id
       ), reviews AS (
         SELECT r.staff_id,
                COUNT(*) FILTER (WHERE r.status='OPEN')::int AS open_reviews,
                COUNT(*) FILTER (WHERE r.status='OPEN' AND r.due_at<NOW())::int AS overdue_reviews
         FROM competency_reviews r
         WHERE r.tenant_id=$1::text AND r.company_id=$2::text
           AND ($3::text IS NULL OR r.branch_id=$3::text)
         GROUP BY r.staff_id
       )
       SELECT s.id AS "staffId",s."firstName" AS "firstName",s."lastName" AS "lastName",
              g.branch_id AS "branchId",g.requirements,g.gaps,
              COALESCE(t.open_assignments,0)::int AS "openAssignments",
              COALESCE(t.overdue_assignments,0)::int AS "overdueAssignments",
              COALESCE(rv.open_reviews,0)::int AS "openReviews",
              COALESCE(rv.overdue_reviews,0)::int AS "overdueReviews",
              (g.gaps*3 + COALESCE(t.overdue_assignments,0)*2 + COALESCE(rv.overdue_reviews,0)*2)::int AS "riskScore"
       FROM gap_summary g
       JOIN staff s ON s.id=g.staff_id
       LEFT JOIN training t ON t.staff_id=g.staff_id
       LEFT JOIN reviews rv ON rv.staff_id=g.staff_id
       ORDER BY "riskScore" DESC,g.gaps DESC,s."firstName",s."lastName"
       LIMIT $4`,
      c.tenantId,
      c.companyId,
      c.branchId,
      bounded,
    );
  }
}
