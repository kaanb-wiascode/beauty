import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingProgramService } from './training-program.service';

@Injectable()
export class TrainingDevelopmentAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly programs: TrainingProgramService,
  ) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  async materialize(planId: string, itemId: string, actorUserId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i.item_type AS "itemType",i.course_id AS "courseId",i.program_id AS "programId",
              i.due_date AS "dueDate",i.training_assignment_id AS "trainingAssignmentId",
              i.program_assignment_id AS "programAssignmentId",p.staff_id AS "staffId",p.branch_id AS "branchId"
       FROM staff_development_plan_items i
       JOIN staff_development_plans p ON p.id=i.plan_id AND p.tenant_id=i.tenant_id AND p.company_id=i.company_id
       WHERE i.id=$1::text AND i.plan_id=$2::text AND i.tenant_id=$3::text AND i.company_id=$4::text
         AND p.status IN ('DRAFT','ACTIVE') AND ($5::text IS NULL OR p.branch_id=$5::text) LIMIT 1`,
      itemId,planId,c.tenantId,c.companyId,c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Development plan item not found.');
    const item = rows[0];

    if (item.itemType === 'COURSE') {
      if (item.trainingAssignmentId) return { itemId, trainingAssignmentId: item.trainingAssignmentId, duplicate: true };
      return this.prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`development-course:${c.tenantId}:${c.companyId}:${itemId}`);
        const current = await tx.$queryRawUnsafe<any[]>(
          `SELECT training_assignment_id AS "trainingAssignmentId" FROM staff_development_plan_items
           WHERE id=$1::text AND plan_id=$2::text AND tenant_id=$3::text AND company_id=$4::text FOR UPDATE`,
          itemId,planId,c.tenantId,c.companyId,
        );
        if (current[0]?.trainingAssignmentId) return { itemId, trainingAssignmentId: current[0].trainingAssignmentId, duplicate: true };
        const versions = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM training_course_versions WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text AND status='PUBLISHED' ORDER BY version DESC LIMIT 1`,
          c.tenantId,c.companyId,item.courseId,
        );
        if (!versions.length) throw new BadRequestException('Development plan course has no published version.');
        const sourceKey=`development-plan:${planId}:${itemId}`;
        const assignment = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_assignments(tenant_id,company_id,branch_id,course_id,course_version_id,staff_id,source_type,source_key,rationale,status,due_at,assigned_by_user_id,updated_by_user_id)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'MANUAL',$7,$8::jsonb,'ASSIGNED',$9::date,$10::text,$10::text)
           ON CONFLICT(tenant_id,company_id,source_key) DO UPDATE SET source_key=EXCLUDED.source_key
           RETURNING id,status`,
          c.tenantId,c.companyId,item.branchId,item.courseId,versions[0].id,item.staffId,sourceKey,
          JSON.stringify({ source:'DEVELOPMENT_PLAN', planId, itemId }),item.dueDate??null,actorUserId,
        );
        await tx.$executeRawUnsafe(`UPDATE staff_development_plan_items SET training_assignment_id=$2::text,updated_at=now() WHERE id=$1::text`,itemId,assignment[0].id);
        await tx.$executeRawUnsafe(
          `INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,to_status,actor_user_id,note,metadata)
           VALUES($1::text,$2::text,$3::text,$4::text,'CREATED','ASSIGNED',$5::text,'Created by development plan',$6::jsonb)
           ON CONFLICT DO NOTHING`,
          assignment[0].id,c.tenantId,c.companyId,item.branchId,actorUserId,JSON.stringify({planId,itemId}),
        );
        return { itemId, trainingAssignmentId: assignment[0].id, duplicate: false };
      },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    if (item.itemType === 'PROGRAM') {
      if (item.programAssignmentId) return { itemId, programAssignmentId: item.programAssignmentId, duplicate: true };
      const assigned = await this.programs.assign(item.programId,{ branchId:item.branchId, staffId:item.staffId, idempotencyKey:`development-plan:${itemId}` },actorUserId);
      await this.prisma.$executeRawUnsafe(
        `UPDATE staff_development_plan_items SET program_assignment_id=$2::text,updated_at=now()
         WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND program_assignment_id IS NULL`,
        itemId,assigned.programAssignmentId,c.tenantId,c.companyId,
      );
      return { itemId, programAssignmentId: assigned.programAssignmentId, duplicate: false };
    }

    return { itemId, skipped: true, reason: 'Item type does not create a training assignment.' };
  }

  async synchronize(actorUserId: string, limit = 200) {
    const c = this.context();
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 200),1),500);
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.id,i.plan_id AS "planId",i.status,i.training_assignment_id AS "trainingAssignmentId",
                i.program_assignment_id AS "programAssignmentId",p.branch_id AS "branchId",
                ta.status AS "trainingStatus",
                CASE WHEN i.program_assignment_id IS NULL THEN NULL ELSE NOT EXISTS(
                  SELECT 1 FROM training_assignments ca
                  JOIN training_program_items pi ON pi.id = split_part(ca.source_key,':',3)
                  WHERE ca.program_assignment_id=i.program_assignment_id AND pi.is_required=true AND ca.status<>'COMPLETED'
                ) END AS "programComplete"
         FROM staff_development_plan_items i
         JOIN staff_development_plans p ON p.id=i.plan_id
         LEFT JOIN training_assignments ta ON ta.id=i.training_assignment_id
         WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND ($3::text IS NULL OR p.branch_id=$3::text)
           AND i.status IN ('PLANNED','IN_PROGRESS')
           AND (i.training_assignment_id IS NOT NULL OR i.program_assignment_id IS NOT NULL)
         ORDER BY i.updated_at,i.id FOR UPDATE OF i SKIP LOCKED LIMIT $4`,
        c.tenantId,c.companyId,c.branchId,safeLimit,
      );
      let completed=0;
      for(const row of rows){
        const done = row.trainingAssignmentId ? row.trainingStatus==='COMPLETED' : row.programComplete===true;
        if(!done) continue;
        await tx.$executeRawUnsafe(`UPDATE staff_development_plan_items SET status='COMPLETED',completed_at=COALESCE(completed_at,now()),status_updated_at=now(),status_updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,row.id,actorUserId);
        await tx.$executeRawUnsafe(`INSERT INTO staff_development_plan_events(tenant_id,company_id,branch_id,plan_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'ITEM_STATUS_CHANGED',$5::text,$6::jsonb)`,c.tenantId,c.companyId,row.branchId,row.planId,actorUserId,JSON.stringify({itemId:row.id,toStatus:'COMPLETED',source:'TRAINING_COMPLETION_SYNC'}));
        completed++;
      }
      return { scanned: rows.length, completed };
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
