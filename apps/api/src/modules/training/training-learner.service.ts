import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TrainingLessonProgressService } from './training-lesson-progress.service';

@Injectable()
export class TrainingLearnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly progress: TrainingLessonProgressService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  private async identity(userId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT i.user_id AS "userId",i.staff_id AS "staffId",s."branchId" AS "branchId",
              s."firstName" AS "firstName",s."lastName" AS "lastName",s.email,s.status
       FROM training_learner_identities i
       JOIN staff s ON s.id=i.staff_id
       JOIN branches b ON b.id=s."branchId"
       WHERE i.tenant_id=$1::text AND i.company_id=$2::text AND i.user_id=$3::text
         AND s."tenantId"=$1::text AND b."companyId"=$2::text
         AND ($4::text IS NULL OR s."branchId"=$4::text)
       LIMIT 1`,
      c.tenantId,
      c.companyId,
      userId,
      c.branchId,
    ) as any[];
    if (!rows.length) throw new NotFoundException('Authenticated user is not linked to a staff learner profile in the active scope.');
    return rows[0];
  }

  async linkIdentity(input: { userId: string; staffId: string }, actorUserId: string) {
    const c = this.context();
    return this.prisma.$transaction(async tx => {
      const staff = await tx.$queryRawUnsafe(
        `SELECT s.id,s."branchId" AS "branchId" FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1::text AND s."tenantId"=$2::text AND b."companyId"=$3::text
           AND ($4::text IS NULL OR s."branchId"=$4::text) LIMIT 1`,
        input.staffId,
        c.tenantId,
        c.companyId,
        c.branchId,
      ) as any[];
      if (!staff.length) throw new NotFoundException('Staff is outside active tenant/company/branch scope.');
      const users = await tx.$queryRawUnsafe(
        `SELECT u.id FROM users u JOIN memberships m ON m."userId"=u.id
         WHERE u.id=$1::text AND m."tenantId"=$2::text AND m.status='ACTIVE'
           AND (m."companyId" IS NULL OR m."companyId"=$3::text) LIMIT 1`,
        input.userId,
        c.tenantId,
        c.companyId,
      ) as any[];
      if (!users.length) throw new NotFoundException('User has no active membership in tenant/company scope.');
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        `training-learner-identity:${c.tenantId}:${c.companyId}:${input.userId}:${input.staffId}`,
      );
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_learner_identities(tenant_id,company_id,user_id,staff_id,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4::text,$5::text)
         ON CONFLICT(tenant_id,company_id,user_id) DO UPDATE
         SET staff_id=EXCLUDED.staff_id,updated_at=now()
         RETURNING id,user_id AS "userId",staff_id AS "staffId",created_at AS "createdAt",updated_at AS "updatedAt"`,
        c.tenantId,
        c.companyId,
        input.userId,
        input.staffId,
        actorUserId,
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async me(userId: string) {
    return this.identity(userId);
  }

  async assignments(userId: string) {
    const c = this.context();
    const learner = await this.identity(userId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.status,a.assigned_at AS "assignedAt",a.due_at AS "dueAt",a.started_at AS "startedAt",
              a.completed_at AS "completedAt",a.course_version_id AS "courseVersionId",
              c.id AS "courseId",c.code AS "courseCode",c.title AS "courseTitle",
              v.version AS "courseVersion",v.delivery_type AS "deliveryType",
              v.requires_theory AS "requiresTheory",v.requires_practical AS "requiresPractical",
              COUNT(l.id)::int AS "totalLessons",
              COUNT(l.id) FILTER (WHERE l.is_required)::int AS "requiredLessons",
              COUNT(p.lesson_id) FILTER (WHERE p.status='COMPLETED')::int AS "completedLessons",
              COUNT(p.lesson_id) FILTER (WHERE l.is_required AND p.status='COMPLETED')::int AS "completedRequiredLessons",
              r.final_passed AS "finalPassed"
       FROM training_assignments a
       JOIN training_courses c ON c.id=a.course_id
       JOIN training_course_versions v ON v.id=a.course_version_id
       LEFT JOIN training_lessons l ON l.course_version_id=v.id AND l.tenant_id=a.tenant_id AND l.company_id=a.company_id
       LEFT JOIN training_lesson_progress p ON p.assignment_id=a.id AND p.lesson_id=l.id AND p.tenant_id=a.tenant_id AND p.company_id=a.company_id
       LEFT JOIN training_assignment_results r ON r.assignment_id=a.id
       WHERE a.tenant_id=$1::text AND a.company_id=$2::text AND a.staff_id=$3::text
         AND ($4::text IS NULL OR a.branch_id=$4::text)
       GROUP BY a.id,c.id,v.id,r.final_passed
       ORDER BY CASE a.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END,a.due_at NULLS LAST,a.assigned_at DESC`,
      c.tenantId,
      c.companyId,
      learner.staffId,
      c.branchId,
    );
  }

  async assignmentDetail(userId: string, assignmentId: string) {
    const c = this.context();
    const learner = await this.identity(userId);
    const assignments = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.status,a.assigned_at AS "assignedAt",a.due_at AS "dueAt",a.started_at AS "startedAt",
              a.completed_at AS "completedAt",a.course_version_id AS "courseVersionId",
              c.id AS "courseId",c.code AS "courseCode",c.title AS "courseTitle",c.description AS "courseDescription",
              v.version AS "courseVersion",v.title AS "versionTitle",v.description AS "versionDescription",
              v.delivery_type AS "deliveryType",v.requires_theory AS "requiresTheory",v.requires_practical AS "requiresPractical",
              v.theory_pass_score AS "theoryPassScore",v.practical_pass_score AS "practicalPassScore"
       FROM training_assignments a
       JOIN training_courses c ON c.id=a.course_id
       JOIN training_course_versions v ON v.id=a.course_version_id
       WHERE a.id=$1::text AND a.tenant_id=$2::text AND a.company_id=$3::text AND a.staff_id=$4::text
         AND ($5::text IS NULL OR a.branch_id=$5::text) LIMIT 1`,
      assignmentId,
      c.tenantId,
      c.companyId,
      learner.staffId,
      c.branchId,
    );
    if (!assignments.length) throw new NotFoundException('Learner assignment not found.');
    const assignment = assignments[0];
    const modules = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id,m.sequence,m.title,m.description,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',l.id,'sequence',l.sequence,'title',l.title,'contentType',l.content_type,
                'contentText',l.content_text,'durationMinutes',l.duration_minutes,'isRequired',l.is_required,
                'hasDocument',(l.content_type='DOCUMENT' AND l.content_ref IS NOT NULL),
                'contentRef',CASE WHEN l.content_type IN ('VIDEO','LINK') THEN l.content_ref ELSE NULL END,
                'status',COALESCE(p.status,'NOT_STARTED'),'startedAt',p.started_at,'completedAt',p.completed_at
              ) ORDER BY l.sequence,l.id) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS lessons
       FROM training_course_modules m
       LEFT JOIN training_lessons l ON l.module_id=m.id AND l.course_version_id=m.course_version_id
       LEFT JOIN training_lesson_progress p ON p.assignment_id=$4::text AND p.lesson_id=l.id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text AND m.course_version_id=$3::text
       GROUP BY m.id ORDER BY m.sequence,m.id`,
      c.tenantId,
      c.companyId,
      assignment.courseVersionId,
      assignmentId,
    );
    const ungroupedLessons = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,l.sequence,l.title,l.content_type AS "contentType",l.content_text AS "contentText",
              CASE WHEN l.content_type IN ('VIDEO','LINK') THEN l.content_ref ELSE NULL END AS "contentRef",
              (l.content_type='DOCUMENT' AND l.content_ref IS NOT NULL) AS "hasDocument",
              l.duration_minutes AS "durationMinutes",l.is_required AS "isRequired",
              COALESCE(p.status,'NOT_STARTED') AS status,p.started_at AS "startedAt",p.completed_at AS "completedAt"
       FROM training_lessons l
       LEFT JOIN training_lesson_progress p ON p.assignment_id=$4::text AND p.lesson_id=l.id
       WHERE l.tenant_id=$1::text AND l.company_id=$2::text AND l.course_version_id=$3::text AND l.module_id IS NULL
       ORDER BY l.sequence,l.id`,
      c.tenantId,
      c.companyId,
      assignment.courseVersionId,
      assignmentId,
    );
    const exams = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT e.id,e.title,e.pass_score AS "passScore",e.max_attempts AS "maxAttempts",
              COUNT(q.id)::int AS "questionCount",
              COUNT(at.id)::int AS "attemptCount",
              MAX(at.score) AS "bestScore",
              BOOL_OR(at.passed) AS "passed"
       FROM training_exams e
       LEFT JOIN training_exam_questions q ON q.exam_id=e.id
       LEFT JOIN training_exam_attempts at ON at.exam_id=e.id AND at.assignment_id=$4::text
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.course_version_id=$3::text AND e.is_active=true
       GROUP BY e.id ORDER BY e.created_at,e.id`,
      c.tenantId,
      c.companyId,
      assignment.courseVersionId,
      assignmentId,
    );
    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT theory_score AS "theoryScore",theory_passed AS "theoryPassed",practical_score AS "practicalScore",
              practical_passed AS "practicalPassed",final_passed AS "finalPassed",finalized_at AS "finalizedAt"
       FROM training_assignment_results WHERE assignment_id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,
      assignmentId,
      c.tenantId,
      c.companyId,
    );
    const progress = await this.progress.summary(assignmentId);
    const needsAssessment = Boolean(assignment.requiresTheory || assignment.requiresPractical);
    return {
      ...assignment,
      learner,
      modules,
      ungroupedLessons,
      exams,
      progress,
      result: result[0] ?? null,
      completion: {
        lessonsComplete: progress.requiredComplete,
        needsAssessment,
        readyForAssessment: progress.requiredComplete && needsAssessment,
        completed: assignment.status === 'COMPLETED',
      },
    };
  }

  private async assertOwnAssignment(userId: string, assignmentId: string) {
    const c = this.context();
    const learner = await this.identity(userId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,course_version_id AS "courseVersionId" FROM training_assignments
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND staff_id=$4::text
         AND ($5::text IS NULL OR branch_id=$5::text) LIMIT 1`,
      assignmentId,
      c.tenantId,
      c.companyId,
      learner.staffId,
      c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Learner assignment not found.');
    if (!['ASSIGNED','IN_PROGRESS'].includes(rows[0].status)) throw new BadRequestException('Assignment is not open for lesson progress.');
    return rows[0];
  }

  async startLesson(userId: string, assignmentId: string, lessonId: string) {
    await this.assertOwnAssignment(userId, assignmentId);
    return this.progress.start(assignmentId, lessonId, userId);
  }

  async completeLesson(userId: string, assignmentId: string, lessonId: string) {
    const assignment = await this.assertOwnAssignment(userId, assignmentId);
    const progressRow = await this.progress.complete(assignmentId, lessonId, userId);
    const summary = await this.progress.summary(assignmentId);
    if (summary.requiredComplete) {
      const c = this.context();
      const versions = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT requires_theory AS "requiresTheory",requires_practical AS "requiresPractical"
         FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,
        assignment.courseVersionId,
        c.tenantId,
        c.companyId,
      );
      const version = versions[0];
      if (version && !version.requiresTheory && !version.requiresPractical) {
        await this.prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-assignment-complete:${assignmentId}`);
          const current = await tx.$queryRawUnsafe<any[]>(
            `SELECT status,branch_id AS "branchId" FROM training_assignments WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text FOR UPDATE`,
            assignmentId,
            c.tenantId,
            c.companyId,
          );
          if (current.length && ['ASSIGNED','IN_PROGRESS'].includes(current[0].status)) {
            await tx.$executeRawUnsafe(
              `UPDATE training_assignments SET status='COMPLETED',started_at=COALESCE(started_at,now()),completed_at=now(),completed_by_user_id=$2::text,updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,
              assignmentId,
              userId,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,actor_user_id,note)
               VALUES($1::text,$2::text,$3::text,$4::text,'COMPLETED',$5,'COMPLETED',$6::text,'All required lessons completed')`,
              assignmentId,
              c.tenantId,
              c.companyId,
              current[0].branchId,
              current[0].status,
              userId,
            );
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      }
    }
    return { progress: progressRow, summary };
  }
}
