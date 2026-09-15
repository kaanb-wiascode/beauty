import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingLearningPathService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async list() {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.code,p.title,p.description,p.is_active AS "isActive",
              pub.id AS "publishedVersionId",pub.version AS "publishedVersion",
              draft.id AS "draftVersionId",draft.version AS "draftVersion",
              COALESCE(pub_count.count,0)::int AS "publishedItemCount",
              COALESCE(draft_count.count,0)::int AS "draftItemCount"
       FROM training_programs p
       LEFT JOIN LATERAL (
         SELECT v.id,v.version FROM training_program_versions v
         WHERE v.tenant_id=p.tenant_id AND v.company_id=p.company_id AND v.program_id=p.id AND v.status='PUBLISHED'
         ORDER BY v.version DESC LIMIT 1
       ) pub ON true
       LEFT JOIN LATERAL (
         SELECT v.id,v.version FROM training_program_versions v
         WHERE v.tenant_id=p.tenant_id AND v.company_id=p.company_id AND v.program_id=p.id AND v.status='DRAFT'
         ORDER BY v.version DESC LIMIT 1
       ) draft ON true
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS count FROM training_program_items i WHERE i.program_version_id=pub.id) pub_count ON true
       LEFT JOIN LATERAL (SELECT COUNT(*)::int AS count FROM training_program_items i WHERE i.program_version_id=draft.id) draft_count ON true
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text
       ORDER BY p.is_active DESC,p.title`,
      c.tenantId,c.companyId,
    );
  }

  async workspace(programId: string) {
    const c = this.context();
    const programs = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,code,title,description,is_active AS "isActive" FROM training_programs
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,
      programId,c.tenantId,c.companyId,
    );
    if (!programs.length) throw new NotFoundException('Learning path not found.');

    const versions = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,version,status,title,description,published_at AS "publishedAt",created_at AS "createdAt"
       FROM training_program_versions
       WHERE tenant_id=$1::text AND company_id=$2::text AND program_id=$3::text
       ORDER BY version DESC`,
      c.tenantId,c.companyId,programId,
    );
    if (!versions.length) return { ...programs[0], versions: [] };

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.program_version_id AS "programVersionId",i.sequence,i.course_id AS "courseId",
              i.is_required AS "isRequired",i.due_offset_days AS "dueOffsetDays",
              course.code AS "courseCode",course.title AS "courseTitle",course.category,
              COALESCE(jsonb_agg(pre.prerequisite_item_id ORDER BY pre.prerequisite_item_id)
                FILTER (WHERE pre.prerequisite_item_id IS NOT NULL),'[]'::jsonb) AS "prerequisiteItemIds"
       FROM training_program_items i
       JOIN training_program_versions pv ON pv.id=i.program_version_id
       JOIN training_courses course ON course.id=i.course_id
       LEFT JOIN training_program_item_prerequisites pre
         ON pre.tenant_id=i.tenant_id AND pre.company_id=i.company_id AND pre.program_item_id=i.id
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND pv.program_id=$3::text
       GROUP BY i.id,course.code,course.title,course.category
       ORDER BY i.program_version_id,i.sequence,i.id`,
      c.tenantId,c.companyId,programId,
    );
    const grouped = new Map<string, any[]>();
    for (const item of items) grouped.set(item.programVersionId,[...(grouped.get(item.programVersionId)??[]),item]);
    return { ...programs[0], versions: versions.map((version) => ({ ...version, items: grouped.get(version.id) ?? [] })) };
  }

  async addPrerequisite(versionId: string, itemId: string, prerequisiteItemId: string, actorUserId: string) {
    const c = this.context();
    if (!prerequisiteItemId?.trim()) throw new BadRequestException('prerequisiteItemId is required.');
    if (itemId === prerequisiteItemId) throw new BadRequestException('A learning path item cannot depend on itself.');

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,sequence FROM training_program_items
       WHERE tenant_id=$1::text AND company_id=$2::text AND program_version_id=$3::text
         AND (id=$4::text OR id=$5::text)`,
      c.tenantId,c.companyId,versionId,itemId,prerequisiteItemId,
    );
    if (items.length !== 2) throw new NotFoundException('Learning path items not found on this version.');
    const version = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM training_program_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' LIMIT 1`,
      versionId,c.tenantId,c.companyId,
    );
    if (!version.length) throw new BadRequestException('Prerequisites can only be changed on a draft learning path version.');

    const dependencies = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH RECURSIVE deps(item_id,prerequisite_item_id) AS (
         SELECT program_item_id,prerequisite_item_id FROM training_program_item_prerequisites
         WHERE tenant_id=$1::text AND company_id=$2::text AND program_version_id=$3::text AND program_item_id=$4::text
         UNION ALL
         SELECT p.program_item_id,p.prerequisite_item_id FROM training_program_item_prerequisites p
         JOIN deps d ON p.program_item_id=d.prerequisite_item_id
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text AND p.program_version_id=$3::text
       ) SELECT 1 FROM deps WHERE prerequisite_item_id=$5::text LIMIT 1`,
      c.tenantId,c.companyId,versionId,prerequisiteItemId,itemId,
    );
    if (dependencies.length) throw new BadRequestException('Prerequisite would create a dependency cycle.');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_program_item_prerequisites(tenant_id,company_id,program_version_id,program_item_id,prerequisite_item_id,created_by_user_id)
       VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text)
       ON CONFLICT(program_item_id,prerequisite_item_id) DO UPDATE SET prerequisite_item_id=EXCLUDED.prerequisite_item_id
       RETURNING id,program_item_id AS "itemId",prerequisite_item_id AS "prerequisiteItemId"`,
      c.tenantId,c.companyId,versionId,itemId,prerequisiteItemId,actorUserId,
    );
    return rows[0];
  }

  async removePrerequisite(versionId: string, itemId: string, prerequisiteItemId: string) {
    const c = this.context();
    const draft = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM training_program_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' LIMIT 1`,
      versionId,c.tenantId,c.companyId,
    );
    if (!draft.length) throw new BadRequestException('Prerequisites can only be changed on a draft learning path version.');
    const deleted = await this.prisma.$executeRawUnsafe(
      `DELETE FROM training_program_item_prerequisites WHERE tenant_id=$1::text AND company_id=$2::text AND program_version_id=$3::text AND program_item_id=$4::text AND prerequisite_item_id=$5::text`,
      c.tenantId,c.companyId,versionId,itemId,prerequisiteItemId,
    );
    return { deleted: Number(deleted) > 0 };
  }

  async assignmentProgress(programAssignmentId: string) {
    const c = this.context();
    const assignments = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pa.id,pa.status,pa.staff_id AS "staffId",pa.program_id AS "programId",pa.program_version_id AS "programVersionId",
              p.code,p.title,s."firstName" AS "staffFirstName",s."lastName" AS "staffLastName"
       FROM training_program_assignments pa
       JOIN training_programs p ON p.id=pa.program_id
       JOIN staff s ON s.id=pa.staff_id AND s."tenantId"=pa.tenant_id
       WHERE pa.id=$1::text AND pa.tenant_id=$2::text AND pa.company_id=$3::text
         AND ($4::text IS NULL OR pa.branch_id=$4::text) LIMIT 1`,
      programAssignmentId,c.tenantId,c.companyId,c.branchId,
    );
    if (!assignments.length) throw new NotFoundException('Learning path assignment not found.');
    const pa = assignments[0];
    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.sequence,i.course_id AS "courseId",i.is_required AS "isRequired",i.due_offset_days AS "dueOffsetDays",
              course.code AS "courseCode",course.title AS "courseTitle",
              a.id AS "assignmentId",a.status AS "assignmentStatus",a.due_at AS "dueAt",a.completed_at AS "completedAt",
              COALESCE(jsonb_agg(pre.prerequisite_item_id ORDER BY pre.prerequisite_item_id)
                FILTER (WHERE pre.prerequisite_item_id IS NOT NULL),'[]'::jsonb) AS "prerequisiteItemIds"
       FROM training_program_items i
       JOIN training_courses course ON course.id=i.course_id
       LEFT JOIN training_assignments a ON a.tenant_id=i.tenant_id AND a.company_id=i.company_id
         AND a.program_assignment_id=$4::text AND a.source_key=('learning-program:' || $4::text || ':' || i.id)
       LEFT JOIN training_program_item_prerequisites pre ON pre.program_item_id=i.id AND pre.tenant_id=i.tenant_id AND pre.company_id=i.company_id
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.program_version_id=$3::text
       GROUP BY i.id,course.code,course.title,a.id,a.status,a.due_at,a.completed_at
       ORDER BY i.sequence,i.id`,
      c.tenantId,c.companyId,pa.programVersionId,programAssignmentId,
    );
    const statusByItem = new Map(items.map((item) => [item.id,item.assignmentStatus]));
    const decorated = items.map((item) => {
      const prereqs = Array.isArray(item.prerequisiteItemIds) ? item.prerequisiteItemIds : [];
      const blockedBy = prereqs.filter((id: string) => statusByItem.get(id) !== 'COMPLETED');
      return { ...item, isUnlocked: blockedBy.length === 0, blockedByItemIds: blockedBy };
    });
    const required = decorated.filter((item) => item.isRequired);
    const completedRequired = required.filter((item) => item.assignmentStatus === 'COMPLETED').length;
    const progressPercent = required.length ? Math.round((completedRequired / required.length) * 100) : 100;
    return { ...pa, totalItems: decorated.length, requiredItems: required.length, completedRequiredItems: completedRequired, progressPercent, items: decorated };
  }
}
