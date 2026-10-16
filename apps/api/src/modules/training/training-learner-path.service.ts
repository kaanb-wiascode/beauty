import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingLearningPathService } from './training-learning-path.service';

@Injectable()
export class TrainingLearnerPathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly learningPaths: TrainingLearningPathService,
  ) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  private async staffId(userId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.staff_id AS "staffId"
       FROM training_learner_identities i
       JOIN staff s ON s.id=i.staff_id AND s."tenantId"=i.tenant_id
       JOIN branches b ON b.id=s."branchId" AND b."companyId"=i.company_id
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.user_id=$3::text
         AND ($4::text IS NULL OR s."branchId"=$4::text)
       LIMIT 1`,
      c.tenantId,c.companyId,userId,c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Authenticated user is not linked to a staff learner profile in the active scope.');
    return rows[0].staffId as string;
  }

  async list(userId: string) {
    const c = this.context();
    const staffId = await this.staffId(userId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pa.id AS "programAssignmentId",pa.status,pa.assigned_at AS "assignedAt",
              pa.program_id AS "programId",pa.program_version_id AS "programVersionId",
              p.code,p.title,p.description,pv.version,
              COUNT(i.id)::int AS "totalItems",
              COUNT(i.id) FILTER (WHERE i.is_required)::int AS "requiredItems",
              COUNT(i.id) FILTER (WHERE i.is_required AND a.status='COMPLETED')::int AS "completedRequiredItems",
              CASE WHEN COUNT(i.id) FILTER (WHERE i.is_required)=0 THEN 100
                   ELSE ROUND(100.0 * COUNT(i.id) FILTER (WHERE i.is_required AND a.status='COMPLETED') /
                              COUNT(i.id) FILTER (WHERE i.is_required))::int END AS "progressPercent"
       FROM training_program_assignments pa
       JOIN training_programs p ON p.id=pa.program_id
       JOIN training_program_versions pv ON pv.id=pa.program_version_id
       LEFT JOIN training_program_items i ON i.program_version_id=pa.program_version_id
       LEFT JOIN training_assignments a ON a.tenant_id=pa.tenant_id AND a.company_id=pa.company_id
         AND a.program_assignment_id=pa.id
         AND a.source_key=('learning-program:' || pa.id || ':' || i.id)
       WHERE pa.tenant_id=$1::text AND pa.company_id=$2::text AND pa.staff_id=$3::text
         AND ($4::text IS NULL OR pa.branch_id=$4::text)
       GROUP BY pa.id,p.id,pv.id
       ORDER BY CASE pa.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,pa.assigned_at DESC`,
      c.tenantId,c.companyId,staffId,c.branchId,
    );
  }

  async detail(userId: string, programAssignmentId: string) {
    const c = this.context();
    const staffId = await this.staffId(userId);
    const owned = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM training_program_assignments
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND staff_id=$4::text
         AND ($5::text IS NULL OR branch_id=$5::text) LIMIT 1`,
      programAssignmentId,c.tenantId,c.companyId,staffId,c.branchId,
    );
    if (!owned.length) throw new NotFoundException('Learner learning path assignment not found.');
    return this.learningPaths.assignmentProgress(programAssignmentId);
  }
}
