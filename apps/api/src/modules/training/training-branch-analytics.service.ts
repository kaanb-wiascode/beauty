import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingBranchAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async branchSignals(days = 90) {
    const { tenantId, companyId, branchId } = this.tenant.getContext();
    const windowDays = Math.min(Math.max(Number.isFinite(days) ? days : 90, 7), 3650);

    return this.prisma.$queryRawUnsafe<any[]>(
      `WITH assignments AS (
         SELECT a.branch_id,
                COUNT(*)::int AS assignment_count,
                COUNT(*) FILTER (WHERE a.status='COMPLETED')::int AS completed_assignments,
                COUNT(*) FILTER (
                  WHERE a.status IN ('ASSIGNED','IN_PROGRESS')
                    AND a.due_at IS NOT NULL
                    AND a.due_at<NOW()
                )::int AS overdue_assignments
         FROM training_assignments a
         WHERE a.tenant_id=$1::text AND a.company_id=$2::text
           AND ($3::text IS NULL OR a.branch_id=$3::text)
           AND a.assigned_at>=NOW()-($4::int*INTERVAL '1 day')
         GROUP BY a.branch_id
       ), reviews AS (
         SELECT r.branch_id,
                COUNT(*) FILTER (WHERE r.status='OPEN')::int AS open_reviews,
                COUNT(*) FILTER (WHERE r.status='OPEN' AND r.due_at<NOW())::int AS overdue_reviews
         FROM competency_reviews r
         WHERE r.tenant_id=$1::text AND r.company_id=$2::text
           AND ($3::text IS NULL OR r.branch_id=$3::text)
         GROUP BY r.branch_id
       ), active_profiles AS (
         SELECT DISTINCT ON (scp.staff_id)
                scp.staff_id,scp.branch_id,scp.profile_id
         FROM staff_competency_profiles scp
         WHERE scp.tenant_id=$1::text AND scp.company_id=$2::text
           AND ($3::text IS NULL OR scp.branch_id=$3::text)
           AND scp.effective_from<=CURRENT_DATE
           AND (scp.effective_to IS NULL OR scp.effective_to>=CURRENT_DATE)
         ORDER BY scp.staff_id,scp.effective_from DESC,scp.created_at DESC
       ), competency AS (
         SELECT ap.branch_id,
                COUNT(DISTINCT ap.staff_id)::int AS profiled_staff,
                COUNT(req.competency_id)::int AS requirements,
                COUNT(req.competency_id) FILTER (
                  WHERE latest.score IS NULL OR latest.score<req.required_level
                )::int AS gaps,
                ROUND(AVG(latest.score)::numeric,2) AS average_score
         FROM active_profiles ap
         JOIN competency_profile_requirements req ON req.profile_id=ap.profile_id
         LEFT JOIN LATERAL (
           SELECT assessment.score
           FROM staff_competency_assessments assessment
           WHERE assessment.tenant_id=$1::text AND assessment.company_id=$2::text
             AND assessment.branch_id=ap.branch_id
             AND assessment.staff_id=ap.staff_id
             AND assessment.competency_id=req.competency_id
           ORDER BY assessment.assessed_at DESC,assessment.created_at DESC
           LIMIT 1
         ) latest ON true
         GROUP BY ap.branch_id
       )
       SELECT b.id AS "branchId",b.name AS "branchName",b.code AS "branchCode",
              COALESCE(a.assignment_count,0)::int AS "assignmentCount",
              COALESCE(a.completed_assignments,0)::int AS "completedAssignments",
              COALESCE(a.overdue_assignments,0)::int AS "overdueAssignments",
              CASE WHEN COALESCE(a.assignment_count,0)=0 THEN NULL
                   ELSE ROUND((100.0*COALESCE(a.completed_assignments,0)/a.assignment_count)::numeric,2)
              END AS "completionRate",
              COALESCE(r.open_reviews,0)::int AS "openReviews",
              COALESCE(r.overdue_reviews,0)::int AS "overdueReviews",
              COALESCE(c.profiled_staff,0)::int AS "profiledStaff",
              COALESCE(c.requirements,0)::int AS requirements,
              COALESCE(c.gaps,0)::int AS gaps,
              c.average_score AS "averageCompetencyScore"
       FROM branches b
       JOIN companies company ON company.id=b."companyId"
         AND company.id=$2::text AND company."tenantId"=$1::text
       LEFT JOIN assignments a ON a.branch_id=b.id
       LEFT JOIN reviews r ON r.branch_id=b.id
       LEFT JOIN competency c ON c.branch_id=b.id
       WHERE b.status='ACTIVE' AND ($3::text IS NULL OR b.id=$3::text)
       ORDER BY COALESCE(a.overdue_assignments,0) DESC,COALESCE(c.gaps,0) DESC,b.name`,
      tenantId,
      companyId,
      branchId,
      windowDays,
    );
  }
}
