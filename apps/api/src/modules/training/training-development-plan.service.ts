import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type DevelopmentPlanItemType =
  | 'COMPETENCY'
  | 'COURSE'
  | 'PROGRAM'
  | 'ACTION'
  | 'COACHING'
  | 'MENTORING'
  | 'PROJECT'
  | 'STRETCH_ASSIGNMENT';

export interface AddDevelopmentPlanItemInput {
  sequence: number;
  itemType: DevelopmentPlanItemType;
  competencyId?: string | null;
  courseId?: string | null;
  programId?: string | null;
  targetLevel?: number | null;
  note?: string | null;
  dueDate?: string | null;
  activityTitle?: string | null;
  activityDescription?: string | null;
  facilitatorStaffId?: string | null;
}

const TITLED_ACTIVITY_TYPES = new Set<DevelopmentPlanItemType>([
  'COACHING',
  'MENTORING',
  'PROJECT',
  'STRETCH_ASSIGNMENT',
]);

@Injectable()
export class TrainingDevelopmentPlanService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private date(value: string | null | undefined) {
    if (value == null || value === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('dueDate must use YYYY-MM-DD.');
    return value;
  }

  async detail(planId: string) {
    const c = this.context();
    const plans = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.branch_id AS "branchId",p.staff_id AS "staffId",p.title,p.status,
              p.start_date AS "startDate",p.target_date AS "targetDate",p.owner_user_id AS "ownerUserId",
              p.created_at AS "createdAt",p.completed_at AS "completedAt",
              s."firstName" AS "staffFirstName",s."lastName" AS "staffLastName"
       FROM staff_development_plans p
       JOIN staff s ON s.id=p.staff_id AND s."tenantId"=p.tenant_id AND s."branchId"=p.branch_id
       WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
         AND ($4::text IS NULL OR p.branch_id=$4::text)
       LIMIT 1`,
      planId,c.tenantId,c.companyId,c.branchId,
    );
    if (!plans.length) throw new NotFoundException('Development plan not found.');

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.sequence,i.item_type AS "itemType",i.status,
              i.competency_id AS "competencyId",cd.code AS "competencyCode",cd.name AS "competencyName",
              i.course_id AS "courseId",tc.code AS "courseCode",tc.title AS "courseTitle",
              i.program_id AS "programId",tp.code AS "programCode",tp.title AS "programTitle",
              i.target_level AS "targetLevel",i.note,i.due_date AS "dueDate",
              i.activity_title AS "activityTitle",i.activity_description AS "activityDescription",
              i.facilitator_staff_id AS "facilitatorStaffId",fs."firstName" AS "facilitatorFirstName",fs."lastName" AS "facilitatorLastName",
              i.completed_at AS "completedAt",i.status_updated_at AS "statusUpdatedAt"
       FROM staff_development_plan_items i
       LEFT JOIN competency_definitions cd ON cd.id=i.competency_id AND cd.tenant_id=i.tenant_id AND cd.company_id=i.company_id
       LEFT JOIN training_courses tc ON tc.id=i.course_id AND tc.tenant_id=i.tenant_id AND tc.company_id=i.company_id
       LEFT JOIN training_programs tp ON tp.id=i.program_id AND tp.tenant_id=i.tenant_id AND tp.company_id=i.company_id
       LEFT JOIN staff fs ON fs.id=i.facilitator_staff_id AND fs."tenantId"=i.tenant_id
       WHERE i.plan_id=$1::text AND i.tenant_id=$2::text AND i.company_id=$3::text
       ORDER BY i.sequence,i.created_at,i.id`,
      planId,c.tenantId,c.companyId,
    );

    const completedItemCount = items.filter((item) => item.status === 'COMPLETED').length;
    return {
      ...plans[0],
      itemCount: items.length,
      completedItemCount,
      progressPercent: items.length ? Math.round((completedItemCount / items.length) * 100) : 0,
      items,
    };
  }

  private async validateResource(
    tx: Prisma.TransactionClient,
    type: DevelopmentPlanItemType,
    input: AddDevelopmentPlanItemInput,
    planBranchId: string,
  ) {
    const c = this.context();
    const ids = [input.competencyId, input.courseId, input.programId].filter(Boolean);

    if (type === 'COMPETENCY') {
      if (!input.competencyId || ids.length !== 1) throw new BadRequestException('COMPETENCY items require only competencyId.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM competency_definitions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        input.competencyId,c.tenantId,c.companyId,
      );
      if (!rows.length) throw new BadRequestException('Competency is outside scope or inactive.');
      if (input.targetLevel == null || !Number.isFinite(Number(input.targetLevel)) || Number(input.targetLevel) < 0 || Number(input.targetLevel) > 100) {
        throw new BadRequestException('COMPETENCY items require targetLevel between 0 and 100.');
      }
      return;
    }

    if (input.targetLevel != null) throw new BadRequestException('targetLevel is only valid for COMPETENCY items.');

    if (type === 'COURSE') {
      if (!input.courseId || ids.length !== 1) throw new BadRequestException('COURSE items require only courseId.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT c.id FROM training_courses c
         WHERE c.id=$1::text AND c.tenant_id=$2::text AND c.company_id=$3::text AND c.is_active=true
           AND EXISTS(SELECT 1 FROM training_course_versions v WHERE v.tenant_id=c.tenant_id AND v.company_id=c.company_id AND v.course_id=c.id AND v.status='PUBLISHED')
         LIMIT 1`,
        input.courseId,c.tenantId,c.companyId,
      );
      if (!rows.length) throw new BadRequestException('Course is outside scope, inactive, or has no published version.');
      return;
    }

    if (type === 'PROGRAM') {
      if (!input.programId || ids.length !== 1) throw new BadRequestException('PROGRAM items require only programId.');
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT p.id FROM training_programs p
         WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text AND p.is_active=true
           AND EXISTS(SELECT 1 FROM training_program_versions v WHERE v.tenant_id=p.tenant_id AND v.company_id=p.company_id AND v.program_id=p.id AND v.status='PUBLISHED')
         LIMIT 1`,
        input.programId,c.tenantId,c.companyId,
      );
      if (!rows.length) throw new BadRequestException('Learning path is outside scope, inactive, or has no published version.');
      return;
    }

    if (ids.length) throw new BadRequestException(`${type} items cannot reference competencyId, courseId, or programId.`);
    const title = input.activityTitle?.trim();
    if (TITLED_ACTIVITY_TYPES.has(type) && !title) throw new BadRequestException(`${type} items require activityTitle.`);

    if (input.facilitatorStaffId) {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id FROM staff s
         JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1::text AND s."tenantId"=$2::text AND b."companyId"=$3::text
           AND s."branchId"=$4::text AND s.status='ACTIVE' LIMIT 1`,
        input.facilitatorStaffId,c.tenantId,c.companyId,planBranchId,
      );
      if (!rows.length) throw new BadRequestException('Development activity facilitator must be active in the plan branch.');
    }
  }

  async addItem(planId: string, input: AddDevelopmentPlanItemInput, actorUserId: string) {
    const c = this.context();
    const sequence = Math.trunc(Number(input.sequence));
    const type = input.itemType?.trim().toUpperCase() as DevelopmentPlanItemType;
    const allowed: DevelopmentPlanItemType[] = ['COMPETENCY','COURSE','PROGRAM','ACTION','COACHING','MENTORING','PROJECT','STRETCH_ASSIGNMENT'];
    if (!Number.isFinite(sequence) || sequence < 1 || !allowed.includes(type)) throw new BadRequestException('Invalid development plan item.');
    const dueDate = this.date(input.dueDate);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `development-plan:${c.tenantId}:${c.companyId}:${planId}`);
      const plans = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,branch_id AS "branchId" FROM staff_development_plans
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           AND status IN ('DRAFT','ACTIVE') AND ($4::text IS NULL OR branch_id=$4::text)
         FOR UPDATE`,
        planId,c.tenantId,c.companyId,c.branchId,
      );
      if (!plans.length) throw new NotFoundException('Active development plan not found.');
      const plan = plans[0];

      await this.validateResource(tx,type,input,plan.branchId);

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO staff_development_plan_items(
           tenant_id,company_id,plan_id,sequence,item_type,competency_id,course_id,program_id,target_level,note,due_date,
           activity_title,activity_description,facilitator_staff_id
         ) VALUES($1::text,$2::text,$3::text,$4,$5,$6::text,$7::text,$8::text,$9,$10,$11::date,$12,$13,$14::text)
         RETURNING id,sequence,item_type AS "itemType",status,competency_id AS "competencyId",course_id AS "courseId",
                   program_id AS "programId",target_level AS "targetLevel",due_date AS "dueDate",
                   activity_title AS "activityTitle",activity_description AS "activityDescription",facilitator_staff_id AS "facilitatorStaffId"`,
        c.tenantId,c.companyId,planId,sequence,type,input.competencyId??null,input.courseId??null,input.programId??null,
        input.targetLevel??null,input.note?.trim()||null,dueDate,input.activityTitle?.trim()||null,
        input.activityDescription?.trim()||null,input.facilitatorStaffId??null,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO staff_development_plan_events(tenant_id,company_id,branch_id,plan_id,event_type,actor_user_id,metadata)
         VALUES($1::text,$2::text,$3::text,$4::text,'ITEM_ADDED',$5::text,$6::jsonb)`,
        c.tenantId,c.companyId,plan.branchId,planId,actorUserId,
        JSON.stringify({ itemId: rows[0].id, itemType: type, facilitatorStaffId: input.facilitatorStaffId ?? null }),
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
