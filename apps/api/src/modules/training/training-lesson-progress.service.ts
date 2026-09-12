import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingLessonProgressService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  private async assignmentLesson(tx:any,assignmentId:string,lessonId:string){
    const c=this.context();
    const rows=await tx.$queryRawUnsafe<any[]>(
      `SELECT a.id AS "assignmentId",a.status,a.branch_id AS "branchId",a.staff_id AS "staffId",a.course_version_id AS "courseVersionId",l.id AS "lessonId",l.is_required AS "isRequired"
       FROM training_assignments a
       JOIN training_lessons l ON l.course_version_id=a.course_version_id
       WHERE a.id=$1::text AND l.id=$2::text AND a.tenant_id=$3::text AND a.company_id=$4::text
         AND l.tenant_id=a.tenant_id AND l.company_id=a.company_id
         AND ($5::text IS NULL OR a.branch_id=$5::text) LIMIT 1`,
      assignmentId,lessonId,c.tenantId,c.companyId,c.branchId,
    );
    if(!rows.length)throw new NotFoundException('Lesson does not belong to the assigned course version.');
    if(!['ASSIGNED','IN_PROGRESS'].includes(rows[0].status))throw new BadRequestException('Assignment is not open for lesson progress.');
    return rows[0];
  }

  async start(assignmentId:string,lessonId:string,actorUserId:string){
    const c=this.context();
    return this.prisma.$transaction(async tx=>{
      const a=await this.assignmentLesson(tx,assignmentId,lessonId);
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-lesson:${assignmentId}:${lessonId}`);
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_lesson_progress(tenant_id,company_id,branch_id,assignment_id,lesson_id,staff_id,status,started_at,updated_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'IN_PROGRESS',now(),$7::text)
         ON CONFLICT(tenant_id,company_id,assignment_id,lesson_id) DO UPDATE
         SET status=CASE WHEN training_lesson_progress.status='NOT_STARTED' THEN 'IN_PROGRESS' ELSE training_lesson_progress.status END,
             started_at=COALESCE(training_lesson_progress.started_at,now()),updated_by_user_id=$7::text,updated_at=now()
         RETURNING id,status,started_at AS "startedAt",completed_at AS "completedAt"`,
        c.tenantId,c.companyId,a.branchId,assignmentId,lessonId,a.staffId??null,actorUserId,
      );
      if(a.status==='ASSIGNED')await tx.$executeRawUnsafe(`UPDATE training_assignments SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,assignmentId,actorUserId);
      if(rows[0].status==='IN_PROGRESS')await tx.$executeRawUnsafe(
        `INSERT INTO training_lesson_progress_events(tenant_id,company_id,branch_id,assignment_id,lesson_id,event_type,from_status,to_status,actor_user_id)
         SELECT $1::text,$2::text,$3::text,$4::text,$5::text,'STARTED','NOT_STARTED','IN_PROGRESS',$6::text
         WHERE NOT EXISTS(SELECT 1 FROM training_lesson_progress_events WHERE assignment_id=$4::text AND lesson_id=$5::text AND event_type='STARTED')`,
        c.tenantId,c.companyId,a.branchId,assignmentId,lessonId,actorUserId,
      );
      return rows[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async complete(assignmentId:string,lessonId:string,actorUserId:string){
    const c=this.context();
    return this.prisma.$transaction(async tx=>{
      const a=await this.assignmentLesson(tx,assignmentId,lessonId);
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-lesson:${assignmentId}:${lessonId}`);
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_lesson_progress(tenant_id,company_id,branch_id,assignment_id,lesson_id,staff_id,status,started_at,completed_at,completed_by_user_id,updated_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,'COMPLETED',now(),now(),$7::text,$7::text)
         ON CONFLICT(tenant_id,company_id,assignment_id,lesson_id) DO UPDATE
         SET status='COMPLETED',started_at=COALESCE(training_lesson_progress.started_at,now()),completed_at=COALESCE(training_lesson_progress.completed_at,now()),
             completed_by_user_id=COALESCE(training_lesson_progress.completed_by_user_id,$7::text),updated_by_user_id=$7::text,updated_at=now()
         RETURNING id,status,started_at AS "startedAt",completed_at AS "completedAt"`,
        c.tenantId,c.companyId,a.branchId,assignmentId,lessonId,a.staffId??null,actorUserId,
      );
      if(a.status==='ASSIGNED')await tx.$executeRawUnsafe(`UPDATE training_assignments SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,assignmentId,actorUserId);
      await tx.$executeRawUnsafe(
        `INSERT INTO training_lesson_progress_events(tenant_id,company_id,branch_id,assignment_id,lesson_id,event_type,from_status,to_status,actor_user_id)
         SELECT $1::text,$2::text,$3::text,$4::text,$5::text,'COMPLETED','IN_PROGRESS','COMPLETED',$6::text
         WHERE NOT EXISTS(SELECT 1 FROM training_lesson_progress_events WHERE assignment_id=$4::text AND lesson_id=$5::text AND event_type='COMPLETED')`,
        c.tenantId,c.companyId,a.branchId,assignmentId,lessonId,actorUserId,
      );
      return rows[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async summary(assignmentId:string){
    const c=this.context();
    const assignments=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,course_version_id AS "courseVersionId" FROM training_assignments WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND ($4::text IS NULL OR branch_id=$4::text) LIMIT 1`,
      assignmentId,c.tenantId,c.companyId,c.branchId,
    );
    if(!assignments.length)throw new NotFoundException('Training assignment not found.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id AS "lessonId",l.sequence,l.title,l.is_required AS "isRequired",COALESCE(p.status,'NOT_STARTED') AS status,p.started_at AS "startedAt",p.completed_at AS "completedAt"
       FROM training_lessons l
       LEFT JOIN training_lesson_progress p ON p.lesson_id=l.id AND p.assignment_id=$4::text AND p.tenant_id=l.tenant_id AND p.company_id=l.company_id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.course_version_id=$3::text ORDER BY l.sequence,l.id`,
      c.tenantId,c.companyId,assignments[0].courseVersionId,assignmentId,
    );
    const required=rows.filter(r=>r.isRequired);const completedRequired=required.filter(r=>r.status==='COMPLETED').length;
    return{assignmentId,requiredLessons:required.length,completedRequiredLessons:completedRequired,requiredComplete:completedRequired===required.length,totalLessons:rows.length,completedLessons:rows.filter(r=>r.status==='COMPLETED').length,lessons:rows};
  }
}
