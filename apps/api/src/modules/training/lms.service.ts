import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type VersionRow = {
  id: string;
  courseId: string;
  version: number;
  status: string;
  deliveryType: string;
  requiresTheory: boolean;
  requiresPractical: boolean;
  theoryPassScore: number | null;
  practicalPassScore: number | null;
};

type CertificateRow = {
  id: string;
  certificateNo: string;
  issuedAt: Date;
};

@Injectable()
export class LmsService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context() {
    return { tenantId: this.tenant.getTenantId(), companyId: this.tenant.getCompanyId(), branchId: this.tenant.getBranchId() };
  }

  private score(value: unknown, field: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new BadRequestException(`${field} must be between 0 and 100.`);
    return n;
  }

  private async version(versionId: string, draftOnly = false): Promise<VersionRow> {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT v.id,v.course_id AS "courseId",v.version,v.status,v.delivery_type AS "deliveryType",
              v.requires_theory AS "requiresTheory",v.requires_practical AS "requiresPractical",
              v.theory_pass_score AS "theoryPassScore",v.practical_pass_score AS "practicalPassScore"
       FROM training_course_versions v
       WHERE v.id=$1::text AND v.tenant_id=$2::text AND v.company_id=$3::text
         AND ($4::boolean=false OR v.status='DRAFT') LIMIT 1`,
      versionId,c.tenantId,c.companyId,draftOnly,
    );
    if (!rows.length) throw new NotFoundException(draftOnly ? 'Draft course version not found.' : 'Course version not found.');
    return rows[0];
  }

  private async assignment(id: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = (await tx.$queryRawUnsafe(
      `SELECT a.id,a.status,a.branch_id AS "branchId",a.staff_id AS "staffId",a.course_id AS "courseId",
              a.course_version_id AS "courseVersionId"
       FROM training_assignments a
       WHERE a.id=$1::text AND a.tenant_id=$2::text AND a.company_id=$3::text
         AND ($4::text IS NULL OR a.branch_id=$4::text) LIMIT 1`,
      id,c.tenantId,c.companyId,c.branchId,
    )) as any[];
    if (!rows.length) throw new NotFoundException('Training assignment not found.');
    return rows[0];
  }

  async createVersion(courseId: string, input: { title?: string; description?: string | null; theoryPassScore?: number; practicalPassScore?: number; effectiveFrom?: string | null; effectiveTo?: string | null }, actorUserId: string) {
    const c = this.context();
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-course-version:${c.tenantId}:${c.companyId}:${courseId}`);
      const courses = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,title,description,delivery_type AS "deliveryType" FROM training_courses
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true LIMIT 1`,
        courseId,c.tenantId,c.companyId,
      );
      if (!courses.length) throw new NotFoundException('Training course not found.');
      const course = courses[0];
      const versions = await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(MAX(version),0)+1 AS version FROM training_course_versions WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text`,
        c.tenantId,c.companyId,courseId,
      );
      const delivery = String(course.deliveryType);
      const requiresTheory = delivery === 'THEORY' || delivery === 'BLENDED';
      const requiresPractical = delivery === 'PRACTICAL' || delivery === 'BLENDED';
      const theoryScore = requiresTheory ? this.score(input.theoryPassScore ?? 70,'theoryPassScore') : null;
      const practicalScore = requiresPractical ? this.score(input.practicalPassScore ?? 70,'practicalPassScore') : null;
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_course_versions(tenant_id,company_id,course_id,version,status,title,description,delivery_type,theory_pass_score,practical_pass_score,requires_theory,requires_practical,effective_from,effective_to,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14::text)
         RETURNING id,course_id AS "courseId",version,status,title,delivery_type AS "deliveryType",requires_theory AS "requiresTheory",requires_practical AS "requiresPractical",theory_pass_score AS "theoryPassScore",practical_pass_score AS "practicalPassScore"`,
        c.tenantId,c.companyId,courseId,Number(versions[0]?.version??1),input.title?.trim()||course.title,input.description===undefined?course.description:(input.description?.trim()||null),delivery,theoryScore,practicalScore,requiresTheory,requiresPractical,input.effectiveFrom??null,input.effectiveTo??null,actorUserId,
      );
      return rows[0];
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listVersions(courseId: string) {
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,version,status,title,description,delivery_type AS "deliveryType",theory_pass_score AS "theoryPassScore",practical_pass_score AS "practicalPassScore",requires_theory AS "requiresTheory",requires_practical AS "requiresPractical",effective_from AS "effectiveFrom",effective_to AS "effectiveTo",published_at AS "publishedAt",created_at AS "createdAt"
       FROM training_course_versions WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text ORDER BY version DESC`,
      c.tenantId,c.companyId,courseId,
    );
  }

  async addLesson(versionId: string, input: { sequence: number; title: string; contentType: string; contentText?: string | null; contentRef?: string | null; durationMinutes?: number | null; isRequired?: boolean }, actorUserId: string) {
    await this.version(versionId,true);
    const c=this.context(),sequence=Math.trunc(Number(input.sequence)),type=input.contentType?.trim().toUpperCase(),title=input.title?.trim();
    if(!Number.isInteger(sequence)||sequence<1)throw new BadRequestException('sequence must be a positive integer.');
    if(!title)throw new BadRequestException('Lesson title is required.');
    if(!['TEXT','VIDEO','LINK','DOCUMENT'].includes(type))throw new BadRequestException('Invalid lesson contentType.');
    if(input.durationMinutes!=null&&(!Number.isFinite(Number(input.durationMinutes))||Number(input.durationMinutes)<0))throw new BadRequestException('durationMinutes must be non-negative.');
    if(input.contentRef&&/^https?:\/\//i.test(input.contentRef)&&type==='DOCUMENT')throw new BadRequestException('DOCUMENT contentRef must be an opaque storage reference, not a public or signed URL.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_lessons(tenant_id,company_id,course_version_id,sequence,title,content_type,content_text,content_ref,duration_minutes,is_required,created_by_user_id)
       VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11::text)
       RETURNING id,sequence,title,content_type AS "contentType",duration_minutes AS "durationMinutes",is_required AS "isRequired"`,
      c.tenantId,c.companyId,versionId,sequence,title,type,input.contentText?.trim()||null,input.contentRef?.trim()||null,input.durationMinutes==null?null:Math.trunc(Number(input.durationMinutes)),input.isRequired!==false,actorUserId,
    );
    return rows[0];
  }

  async createExam(versionId:string,input:{title:string;passScore?:number;maxAttempts?:number|null},actorUserId:string){
    const version=await this.version(versionId,true);if(!version.requiresTheory)throw new BadRequestException('This course version does not require a theory exam.');
    const c=this.context(),title=input.title?.trim(),pass=this.score(input.passScore??version.theoryPassScore??70,'passScore');
    if(!title)throw new BadRequestException('Exam title is required.');
    const max=input.maxAttempts==null?null:Math.trunc(Number(input.maxAttempts));if(max!=null&&max<1)throw new BadRequestException('maxAttempts must be at least 1.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO training_exams(tenant_id,company_id,course_version_id,title,pass_score,max_attempts,created_by_user_id) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::text) RETURNING id,title,pass_score AS "passScore",max_attempts AS "maxAttempts"`,c.tenantId,c.companyId,versionId,title,pass,max,actorUserId);return rows[0];
  }

  async addQuestion(examId:string,input:{sequence:number;questionType:string;prompt:string;options?:unknown;correctAnswer:unknown;points?:number},actorUserId:string){
    const c=this.context();
    const exams=await this.prisma.$queryRawUnsafe<any[]>(`SELECT e.id FROM training_exams e JOIN training_course_versions v ON v.id=e.course_version_id WHERE e.id=$1::text AND e.tenant_id=$2::text AND e.company_id=$3::text AND v.status='DRAFT' LIMIT 1`,examId,c.tenantId,c.companyId);
    if(!exams.length)throw new NotFoundException('Exam on draft course version not found.');
    const sequence=Math.trunc(Number(input.sequence)),type=input.questionType?.trim().toUpperCase(),prompt=input.prompt?.trim(),points=Number(input.points??1);
    if(!Number.isInteger(sequence)||sequence<1)throw new BadRequestException('sequence must be a positive integer.');
    if(!['SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE'].includes(type))throw new BadRequestException('Invalid questionType.');
    if(!prompt)throw new BadRequestException('Question prompt is required.');
    if(!Number.isFinite(points)||points<=0)throw new BadRequestException('points must be greater than zero.');
    if(input.correctAnswer===undefined)throw new BadRequestException('correctAnswer is required.');
    const rows=await this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO training_exam_questions(tenant_id,company_id,exam_id,sequence,question_type,prompt,options,correct_answer,points,created_by_user_id) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::text) RETURNING id,sequence,question_type AS "questionType",prompt,options,points`,c.tenantId,c.companyId,examId,sequence,type,prompt,input.options==null?null:JSON.stringify(input.options),JSON.stringify(input.correctAnswer),points,actorUserId);return rows[0];
  }

  async publishVersion(versionId:string,actorUserId:string){
    const c=this.context();
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRawUnsafe<any[]>(`SELECT id,course_id AS "courseId",requires_theory AS "requiresTheory",requires_practical AS "requiresPractical" FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,versionId,c.tenantId,c.companyId);
      if(!rows.length)throw new NotFoundException('Draft course version not found.');const v=rows[0];
      if(v.requiresTheory){const exams=await tx.$queryRawUnsafe<any[]>(`SELECT e.id,COUNT(q.id)::int AS questions FROM training_exams e LEFT JOIN training_exam_questions q ON q.exam_id=e.id WHERE e.course_version_id=$1::text AND e.is_active=true GROUP BY e.id`,versionId);if(!exams.length||exams.some((e:any)=>Number(e.questions)<1))throw new BadRequestException('Theory course version requires at least one active exam with questions.');}
      await tx.$executeRawUnsafe(`UPDATE training_course_versions SET status='RETIRED',effective_to=COALESCE(effective_to,CURRENT_DATE),updated_at=now() WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text AND status='PUBLISHED'`,c.tenantId,c.companyId,v.courseId);
      const published=await tx.$queryRawUnsafe<any[]>(`UPDATE training_course_versions SET status='PUBLISHED',published_by_user_id=$2::text,published_at=now(),effective_from=COALESCE(effective_from,CURRENT_DATE),updated_at=now() WHERE id=$1::text RETURNING id,course_id AS "courseId",version,status,published_at AS "publishedAt"`,versionId,actorUserId);
      return published[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async publishedCourse(courseId:string){
    const c=this.context();
    const versions=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,course_id AS "courseId",version,status,title,description,delivery_type AS "deliveryType",theory_pass_score AS "theoryPassScore",practical_pass_score AS "practicalPassScore",requires_theory AS "requiresTheory",requires_practical AS "requiresPractical" FROM training_course_versions WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text AND status='PUBLISHED' LIMIT 1`,c.tenantId,c.companyId,courseId);
    if(!versions.length)throw new NotFoundException('Published course version not found.');const v=versions[0];
    const lessons=await this.prisma.$queryRawUnsafe<any[]>(`SELECT id,sequence,title,content_type AS "contentType",content_text AS "contentText",content_ref AS "contentRef",duration_minutes AS "durationMinutes",is_required AS "isRequired" FROM training_lessons WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text ORDER BY sequence`,c.tenantId,c.companyId,v.id);
    const exams=await this.prisma.$queryRawUnsafe<any[]>(`SELECT e.id,e.title,e.pass_score AS "passScore",e.max_attempts AS "maxAttempts",COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'sequence',q.sequence,'questionType',q.question_type,'prompt',q.prompt,'options',q.options,'points',q.points) ORDER BY q.sequence) FILTER(WHERE q.id IS NOT NULL),'[]'::jsonb) AS questions FROM training_exams e LEFT JOIN training_exam_questions q ON q.exam_id=e.id WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.course_version_id=$3::text AND e.is_active=true GROUP BY e.id ORDER BY e.created_at,e.id`,c.tenantId,c.companyId,v.id);
    return{...v,lessons,exams};
  }

  private normalizeAnswer(value:unknown):unknown{
    if(Array.isArray(value))return value.map(v=>String(v)).sort();
    if(typeof value==='string')return value.trim();
    return value;
  }
  private answersEqual(a:unknown,b:unknown){return JSON.stringify(this.normalizeAnswer(a))===JSON.stringify(this.normalizeAnswer(b));}

  async submitExamAttempt(assignmentId:string,examId:string,input:{answers:Record<string,unknown>},actorUserId:string){
    const c=this.context();if(!input.answers||typeof input.answers!=='object'||Array.isArray(input.answers))throw new BadRequestException('answers must be an object keyed by question id.');
    return this.prisma.$transaction(async tx=>{
      const a=await this.assignment(assignmentId,tx);if(!a.courseVersionId)throw new BadRequestException('Legacy assignment has no pinned course version.');if(!['ASSIGNED','IN_PROGRESS'].includes(a.status))throw new BadRequestException('Assignment is not open for assessment.');
      const exams=await tx.$queryRawUnsafe<any[]>(`SELECT id,pass_score AS "passScore",max_attempts AS "maxAttempts" FROM training_exams WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND course_version_id=$4::text AND is_active=true LIMIT 1`,examId,c.tenantId,c.companyId,a.courseVersionId);if(!exams.length)throw new NotFoundException('Exam does not belong to assigned course version.');const exam=exams[0];
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,`training-exam-attempt:${assignmentId}:${examId}`);
      const attempts=await tx.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM training_exam_attempts WHERE assignment_id=$1::text AND exam_id=$2::text`,assignmentId,examId);const attemptNo=Number(attempts[0]?.count??0)+1;if(exam.maxAttempts!=null&&attemptNo>Number(exam.maxAttempts))throw new BadRequestException('Maximum exam attempts reached.');
      const questions=await tx.$queryRawUnsafe<any[]>(`SELECT id,correct_answer AS "correctAnswer",points FROM training_exam_questions WHERE exam_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY sequence`,examId,c.tenantId,c.companyId);if(!questions.length)throw new BadRequestException('Exam has no questions.');
      let earned=0,total=0;const grading:any[]=[];for(const q of questions){const points=Number(q.points);total+=points;const correct=this.answersEqual(input.answers[q.id],q.correctAnswer);if(correct)earned+=points;grading.push({questionId:q.id,correct,pointsEarned:correct?points:0,points});}
      const score=total===0?0:Math.round((earned/total)*10000)/100;const passed=score>=Number(exam.passScore);
      const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO training_exam_attempts(tenant_id,company_id,branch_id,assignment_id,exam_id,staff_id,attempt_no,answers,score,passed,grading_detail,submitted_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8::jsonb,$9,$10,$11::jsonb,$12::text) RETURNING id,attempt_no AS "attemptNo",score,passed,submitted_at AS "submittedAt"`,c.tenantId,c.companyId,a.branchId,assignmentId,examId,a.staffId??null,attemptNo,JSON.stringify(input.answers),score,passed,JSON.stringify(grading),actorUserId);
      if(a.status==='ASSIGNED'){await tx.$executeRawUnsafe(`UPDATE training_assignments SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,assignmentId,actorUserId);await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,actor_user_id,note) VALUES($1::text,$2::text,$3::text,$4::text,'STARTED','ASSIGNED','IN_PROGRESS',$5::text,'Started by exam submission')`,assignmentId,c.tenantId,c.companyId,a.branchId,actorUserId);}
      await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'EXAM_SUBMITTED',$5::text,$6::jsonb)`,assignmentId,c.tenantId,c.companyId,a.branchId,actorUserId,JSON.stringify({examId,attemptNo,score,passed}));return rows[0];
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async assessPractical(assignmentId:string,input:{score:number;criteria?:unknown;evidence?:unknown;note?:string|null;assessedAt?:string},actorUserId:string){
    const c=this.context(),score=this.score(input.score,'score'),assessedAt=input.assessedAt?new Date(input.assessedAt):new Date();if(Number.isNaN(assessedAt.getTime()))throw new BadRequestException('assessedAt is invalid.');
    return this.prisma.$transaction(async tx=>{const a=await this.assignment(assignmentId,tx);if(!a.courseVersionId)throw new BadRequestException('Legacy assignment has no pinned course version.');if(!['ASSIGNED','IN_PROGRESS'].includes(a.status))throw new BadRequestException('Assignment is not open for assessment.');const versions=await tx.$queryRawUnsafe<any[]>(`SELECT requires_practical AS "requiresPractical",practical_pass_score AS "practicalPassScore" FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,a.courseVersionId,c.tenantId,c.companyId);if(!versions[0]?.requiresPractical)throw new BadRequestException('Assigned course version does not require practical assessment.');const passed=score>=Number(versions[0].practicalPassScore??70);const rows=await tx.$queryRawUnsafe<any[]>(`INSERT INTO training_practical_assessments(tenant_id,company_id,branch_id,assignment_id,staff_id,score,passed,criteria,evidence,note,assessor_user_id,assessed_at) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8::jsonb,$9::jsonb,$10,$11::text,$12) RETURNING id,score,passed,assessed_at AS "assessedAt"`,c.tenantId,c.companyId,a.branchId,assignmentId,a.staffId??null,score,passed,JSON.stringify(input.criteria??{}),input.evidence==null?null:JSON.stringify(input.evidence),input.note?.trim()||null,actorUserId,assessedAt);if(a.status==='ASSIGNED')await tx.$executeRawUnsafe(`UPDATE training_assignments SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,assignmentId,actorUserId);await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'PRACTICAL_ASSESSED',$5::text,$6::jsonb)`,assignmentId,c.tenantId,c.companyId,a.branchId,actorUserId,JSON.stringify({score,passed}));return rows[0];},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  private async calculateResult(assignmentId:string,tx:any){
    const c=this.context(),a=await this.assignment(assignmentId,tx);if(!a.courseVersionId)throw new BadRequestException('Legacy assignment has no pinned course version.');const vr=(await tx.$queryRawUnsafe(`SELECT id,requires_theory AS "requiresTheory",requires_practical AS "requiresPractical",theory_pass_score AS "theoryPassScore",practical_pass_score AS "practicalPassScore" FROM training_course_versions WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text LIMIT 1`,a.courseVersionId,c.tenantId,c.companyId)) as any[];if(!vr.length)throw new NotFoundException('Pinned course version not found.');const v=vr[0];
    const theory=(await tx.$queryRawUnsafe(`WITH active AS (SELECT id,pass_score FROM training_exams WHERE course_version_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND is_active=true),best AS (SELECT exam_id,MAX(score) AS score FROM training_exam_attempts WHERE assignment_id=$4::text GROUP BY exam_id) SELECT COUNT(active.id)::int AS exams,COUNT(best.exam_id)::int AS attempted,COALESCE(AVG(best.score),0)::numeric AS score,COALESCE(BOOL_AND(best.score>=active.pass_score),false) AS all_passed FROM active LEFT JOIN best ON best.exam_id=active.id`,a.courseVersionId,c.tenantId,c.companyId,assignmentId)) as any[];const t=theory[0]??{exams:0,attempted:0,score:0,all_passed:false};const theoryScore=Number(t.score??0);const theoryPassed=!v.requiresTheory||(Number(t.exams)>0&&Number(t.attempted)===Number(t.exams)&&Boolean(t.all_passed)&&theoryScore>=Number(v.theoryPassScore??0));
    const practical=(await tx.$queryRawUnsafe(`SELECT score,passed FROM training_practical_assessments WHERE assignment_id=$1::text AND tenant_id=$2::text AND company_id=$3::text ORDER BY assessed_at DESC,created_at DESC LIMIT 1`,assignmentId,c.tenantId,c.companyId)) as any[];const p=practical[0];const practicalScore=p?Number(p.score):null;const practicalPassed=!v.requiresPractical||(!!p&&Boolean(p.passed)&&Number(p.score)>=Number(v.practicalPassScore??0));
    return{assignment:a,version:v,theoryScore:v.requiresTheory?theoryScore:null,theoryPassed:v.requiresTheory?theoryPassed:null,practicalScore:v.requiresPractical?practicalScore:null,practicalPassed:v.requiresPractical?practicalPassed:null,finalPassed:Boolean(theoryPassed&&practicalPassed),explanation:{requiresTheory:Boolean(v.requiresTheory),requiresPractical:Boolean(v.requiresPractical),examCount:Number(t.exams),attemptedExamCount:Number(t.attempted)}};
  }

  async result(assignmentId:string){return this.prisma.$transaction(async tx=>{const r=await this.calculateResult(assignmentId,tx);return{theoryScore:r.theoryScore,theoryPassed:r.theoryPassed,practicalScore:r.practicalScore,practicalPassed:r.practicalPassed,finalPassed:r.finalPassed,explanation:r.explanation};},{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});}

  async finalize(assignmentId:string,actorUserId:string){
    const c=this.context();return this.prisma.$transaction(async tx=>{const r=await this.calculateResult(assignmentId,tx),a=r.assignment;if(['CANCELLED','EXPIRED'].includes(a.status))throw new BadRequestException('Cancelled or expired assignment cannot be finalized.');await tx.$executeRawUnsafe(`INSERT INTO training_assignment_results(assignment_id,tenant_id,company_id,branch_id,course_version_id,theory_score,theory_passed,practical_score,practical_passed,final_passed,explanation,finalized_by_user_id,finalized_at) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,$9,$10,$11::jsonb,$12::text,now()) ON CONFLICT(assignment_id) DO UPDATE SET theory_score=EXCLUDED.theory_score,theory_passed=EXCLUDED.theory_passed,practical_score=EXCLUDED.practical_score,practical_passed=EXCLUDED.practical_passed,final_passed=EXCLUDED.final_passed,explanation=EXCLUDED.explanation,finalized_by_user_id=EXCLUDED.finalized_by_user_id,finalized_at=now()`,assignmentId,c.tenantId,c.companyId,a.branchId,a.courseVersionId,r.theoryScore,r.theoryPassed,r.practicalScore,r.practicalPassed,r.finalPassed,JSON.stringify(r.explanation),actorUserId);await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'RESULT_FINALIZED',$5::text,$6::jsonb)`,assignmentId,c.tenantId,c.companyId,a.branchId,actorUserId,JSON.stringify({theoryScore:r.theoryScore,theoryPassed:r.theoryPassed,practicalScore:r.practicalScore,practicalPassed:r.practicalPassed,finalPassed:r.finalPassed}));if(!r.finalPassed)return{...r,certificate:null};
      if(a.status!=='COMPLETED'){await tx.$executeRawUnsafe(`UPDATE training_assignments SET status='COMPLETED',started_at=COALESCE(started_at,now()),completed_at=now(),completed_by_user_id=$2::text,updated_by_user_id=$2::text,updated_at=now() WHERE id=$1::text`,assignmentId,actorUserId);await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,from_status,to_status,actor_user_id,note) VALUES($1::text,$2::text,$3::text,$4::text,'COMPLETED',$5,'COMPLETED',$6::text,'Assessment requirements satisfied')`,assignmentId,c.tenantId,c.companyId,a.branchId,a.status,actorUserId);}
      let certificate:CertificateRow|null=null;if(a.staffId){const no=`TRN-${new Date().getUTCFullYear()}-${assignmentId.replace(/-/g,'').slice(0,12).toUpperCase()}`;const certs=await tx.$queryRawUnsafe<any[]>(`INSERT INTO training_certificates(tenant_id,company_id,branch_id,staff_id,assignment_id,course_version_id,certificate_no,issued_by_user_id) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8::text) ON CONFLICT(assignment_id) DO UPDATE SET assignment_id=EXCLUDED.assignment_id RETURNING id,certificate_no AS "certificateNo",issued_at AS "issuedAt"`,c.tenantId,c.companyId,a.branchId,a.staffId,assignmentId,a.courseVersionId,no,actorUserId);const issuedCertificate=certs[0] as CertificateRow;certificate=issuedCertificate;await tx.$executeRawUnsafe(`INSERT INTO training_assignment_events(assignment_id,tenant_id,company_id,branch_id,event_type,actor_user_id,metadata) VALUES($1::text,$2::text,$3::text,$4::text,'CERTIFICATE_ISSUED',$5::text,$6::jsonb)`,assignmentId,c.tenantId,c.companyId,a.branchId,actorUserId,JSON.stringify({certificateNo:issuedCertificate.certificateNo}));}return{theoryScore:r.theoryScore,theoryPassed:r.theoryPassed,practicalScore:r.practicalScore,practicalPassed:r.practicalPassed,finalPassed:true,explanation:r.explanation,certificate};},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async listCertificates(input:{staffId?:string;limit?:number}){const c=this.context(),limit=Math.min(Math.max(Math.trunc(input.limit??50),1),200);return this.prisma.$queryRawUnsafe<any[]>(`SELECT cert.id,cert.certificate_no AS "certificateNo",cert.staff_id AS "staffId",cert.assignment_id AS "assignmentId",cert.issued_at AS "issuedAt",cert.expires_at AS "expiresAt",cert.revoked_at AS "revokedAt",v.version AS "courseVersion",course.code AS "courseCode",course.title AS "courseTitle" FROM training_certificates cert JOIN training_course_versions v ON v.id=cert.course_version_id JOIN training_courses course ON course.id=v.course_id WHERE cert.tenant_id=$1::text AND cert.company_id=$2::text AND ($3::text IS NULL OR cert.branch_id=$3::text) AND ($4::text IS NULL OR cert.staff_id=$4::text) ORDER BY cert.issued_at DESC LIMIT $5`,c.tenantId,c.companyId,c.branchId,input.staffId??null,limit);}
}
