import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { LmsService } from './lms.service';
import { TrainingLessonProgressService } from './training-lesson-progress.service';

@Injectable()
export class TrainingLearnerAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly progress: TrainingLessonProgressService,
    private readonly lms: LmsService,
  ) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  private async ownAssignment(userId:string,assignmentId:string){
    const c=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.status,a.course_version_id AS "courseVersionId",a.staff_id AS "staffId"
       FROM training_assignments a
       JOIN training_learner_identities i ON i.staff_id=a.staff_id AND i.tenant_id=a.tenant_id AND i.company_id=a.company_id
       WHERE a.id=$1::text AND a.tenant_id=$2::text AND a.company_id=$3::text AND i.user_id=$4::text
         AND ($5::text IS NULL OR a.branch_id=$5::text) LIMIT 1`,
      assignmentId,c.tenantId,c.companyId,userId,c.branchId,
    );
    if(!rows.length)throw new NotFoundException('Learner assignment not found.');
    if(!rows[0].courseVersionId)throw new BadRequestException('Legacy assignment has no pinned course version.');
    return rows[0];
  }

  private async assertLessonsComplete(assignmentId:string){
    const summary=await this.progress.summary(assignmentId);
    if(!summary.requiredComplete)throw new BadRequestException('Complete all required lessons before starting the assessment.');
    return summary;
  }

  async exam(userId:string,assignmentId:string,examId:string){
    const c=this.context(),assignment=await this.ownAssignment(userId,assignmentId);
    if(!['ASSIGNED','IN_PROGRESS'].includes(assignment.status))throw new BadRequestException('Assignment is not open for assessment.');
    await this.assertLessonsComplete(assignmentId);
    const exams=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,title,pass_score AS "passScore",max_attempts AS "maxAttempts"
       FROM training_exams WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND course_version_id=$4::text AND is_active=true LIMIT 1`,
      examId,c.tenantId,c.companyId,assignment.courseVersionId,
    );
    if(!exams.length)throw new NotFoundException('Exam does not belong to assigned course version.');
    const questions=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,sequence,question_type AS "questionType",prompt,options,points
       FROM training_exam_questions WHERE tenant_id=$1::text AND company_id=$2::text AND exam_id=$3::text
       ORDER BY sequence,id`,
      c.tenantId,c.companyId,examId,
    );
    const attempts=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,attempt_no AS "attemptNo",score,passed,submitted_at AS "submittedAt"
       FROM training_exam_attempts WHERE tenant_id=$1::text AND company_id=$2::text AND assignment_id=$3::text AND exam_id=$4::text
       ORDER BY attempt_no DESC`,
      c.tenantId,c.companyId,assignmentId,examId,
    );
    return{...exams[0],questions,attempts,attemptCount:attempts.length,attemptsRemaining:exams[0].maxAttempts==null?null:Math.max(Number(exams[0].maxAttempts)-attempts.length,0)};
  }

  async submit(userId:string,assignmentId:string,examId:string,answers:Record<string,unknown>){
    const assignment=await this.ownAssignment(userId,assignmentId);
    if(!['ASSIGNED','IN_PROGRESS'].includes(assignment.status))throw new BadRequestException('Assignment is not open for assessment.');
    await this.assertLessonsComplete(assignmentId);
    return this.lms.submitExamAttempt(assignmentId,examId,{answers},userId);
  }

  async finalize(userId:string,assignmentId:string){
    const assignment=await this.ownAssignment(userId,assignmentId);
    if(['CANCELLED','EXPIRED'].includes(assignment.status))throw new BadRequestException('Assignment cannot be finalized.');
    await this.assertLessonsComplete(assignmentId);
    return this.lms.finalize(assignmentId,userId);
  }
}
