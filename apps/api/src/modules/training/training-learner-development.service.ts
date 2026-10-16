import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingLearnerDevelopmentService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private async learner(userId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.staff_id AS "staffId",s."branchId" AS "branchId",s."firstName" AS "firstName",s."lastName" AS "lastName"
       FROM training_learner_identities i
       JOIN staff s ON s.id=i.staff_id AND s."tenantId"=i.tenant_id
       JOIN branches b ON b.id=s."branchId" AND b."companyId"=i.company_id
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.user_id=$3::text
         AND ($4::text IS NULL OR s."branchId"=$4::text)
       LIMIT 1`,
      c.tenantId,c.companyId,userId,c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Authenticated user is not linked to a learner profile in the active scope.');
    return rows[0];
  }

  async list(userId: string) {
    const c = this.context();
    const learner = await this.learner(userId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.title,p.status,p.start_date AS "startDate",p.target_date AS "targetDate",p.completed_at AS "completedAt",
              COUNT(i.id)::int AS "itemCount",
              COUNT(i.id) FILTER(WHERE i.status='COMPLETED')::int AS "completedItemCount",
              COUNT(i.id) FILTER(WHERE i.status IN ('PLANNED','IN_PROGRESS') AND i.due_date<CURRENT_DATE)::int AS "overdueItemCount"
       FROM staff_development_plans p
       LEFT JOIN staff_development_plan_items i
         ON i.plan_id=p.id AND i.tenant_id=p.tenant_id AND i.company_id=p.company_id
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text AND p.staff_id=$3::text AND p.branch_id=$4::text
       GROUP BY p.id
       ORDER BY CASE p.status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,p.target_date NULLS LAST,p.created_at DESC`,
      c.tenantId,c.companyId,learner.staffId,learner.branchId,
    );
  }

  async detail(userId: string, planId: string) {
    const c = this.context();
    const learner = await this.learner(userId);
    const plans = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.title,p.status,p.start_date AS "startDate",p.target_date AS "targetDate",p.completed_at AS "completedAt",
              p.owner_user_id AS "ownerUserId"
       FROM staff_development_plans p
       WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
         AND p.staff_id=$4::text AND p.branch_id=$5::text
       LIMIT 1`,
      planId,c.tenantId,c.companyId,learner.staffId,learner.branchId,
    );
    if (!plans.length) throw new NotFoundException('Learner development plan not found.');

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.sequence,i.item_type AS "itemType",i.status,i.target_level AS "targetLevel",i.note,
              i.due_date AS "dueDate",i.completed_at AS "completedAt",
              i.activity_title AS "activityTitle",i.activity_description AS "activityDescription",
              cd.code AS "competencyCode",cd.name AS "competencyName",
              tc.code AS "courseCode",tc.title AS "courseTitle",
              tp.code AS "programCode",tp.title AS "programTitle",
              fs."firstName" AS "facilitatorFirstName",fs."lastName" AS "facilitatorLastName"
       FROM staff_development_plan_items i
       LEFT JOIN competency_definitions cd ON cd.id=i.competency_id AND cd.tenant_id=i.tenant_id AND cd.company_id=i.company_id
       LEFT JOIN training_courses tc ON tc.id=i.course_id AND tc.tenant_id=i.tenant_id AND tc.company_id=i.company_id
       LEFT JOIN training_programs tp ON tp.id=i.program_id AND tp.tenant_id=i.tenant_id AND tp.company_id=i.company_id
       LEFT JOIN staff fs ON fs.id=i.facilitator_staff_id AND fs."tenantId"=i.tenant_id AND fs."branchId"=$4::text
       WHERE i.plan_id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
       ORDER BY i.sequence,i.created_at,i.id`,
      planId,c.tenantId,c.companyId,learner.branchId,
    );
    const completedItemCount = items.filter((item) => item.status === 'COMPLETED').length;
    return {
      ...plans[0],
      learner,
      itemCount: items.length,
      completedItemCount,
      progressPercent: items.length ? Math.round((completedItemCount / items.length) * 100) : 0,
      items,
    };
  }
}
