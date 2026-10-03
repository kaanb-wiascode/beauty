import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
    };
  }

  private async assertDraftVersion(versionId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT v.id,v.course_id AS "courseId",v.version,v.status,v.title,v.description,
              v.delivery_type AS "deliveryType",v.theory_pass_score AS "theoryPassScore",
              v.practical_pass_score AS "practicalPassScore",v.requires_theory AS "requiresTheory",
              v.requires_practical AS "requiresPractical",v.effective_from AS "effectiveFrom",
              v.effective_to AS "effectiveTo"
       FROM training_course_versions v
       JOIN training_courses c ON c.id=v.course_id
       WHERE v.id=$1::text AND v.tenant_id=$2::text AND v.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      versionId,
      c.tenantId,
      c.companyId,
    ) as any[];
    if (!rows.length) throw new NotFoundException('Draft course version not found.');
    return rows[0];
  }

  private async draftLesson(lessonId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT l.id,l.course_version_id AS "versionId",l.sequence,l.title,l.content_type AS "contentType",
              l.content_text AS "contentText",l.content_ref AS "contentRef",l.duration_minutes AS "durationMinutes",
              l.is_required AS "isRequired"
       FROM training_lessons l
       JOIN training_course_versions v ON v.id=l.course_version_id
       JOIN training_courses c ON c.id=v.course_id
       WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      lessonId,
      c.tenantId,
      c.companyId,
    ) as any[];
    if (!rows.length) throw new NotFoundException('Lesson on draft course version not found.');
    return rows[0];
  }

  private async draftExam(examId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT e.id,e.course_version_id AS "versionId",e.title,e.pass_score AS "passScore",
              e.max_attempts AS "maxAttempts",e.is_active AS "isActive"
       FROM training_exams e
       JOIN training_course_versions v ON v.id=e.course_version_id
       JOIN training_courses c ON c.id=v.course_id
       WHERE e.id=$1::text AND e.tenant_id=$2::text AND e.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      examId,
      c.tenantId,
      c.companyId,
    ) as any[];
    if (!rows.length) throw new NotFoundException('Exam on draft course version not found.');
    return rows[0];
  }

  private async draftQuestion(questionId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT q.id,q.exam_id AS "examId",q.sequence,q.question_type AS "questionType",q.prompt,
              q.options,q.correct_answer AS "correctAnswer",q.points,e.course_version_id AS "versionId"
       FROM training_exam_questions q
       JOIN training_exams e ON e.id=q.exam_id
       JOIN training_course_versions v ON v.id=e.course_version_id
       JOIN training_courses c ON c.id=v.course_id
       WHERE q.id=$1::text AND q.tenant_id=$2::text AND q.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      questionId,
      c.tenantId,
      c.companyId,
    ) as any[];
    if (!rows.length) throw new NotFoundException('Question on draft course version not found.');
    return rows[0];
  }

  private async assertManagedDocument(versionId: string, objectKey: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe(
      `SELECT id FROM training_managed_documents
       WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text
         AND object_key=$4 AND verified_at IS NOT NULL
       LIMIT 1`,
      c.tenantId,
      c.companyId,
      versionId,
      objectKey,
    ) as any[];
    if (!rows.length) {
      throw new BadRequestException('DOCUMENT contentRef must reference a verified private training document.');
    }
  }

  private temporarySequenceBase(rows: Array<{ sequence?: unknown }>, itemCount: number) {
    const maxSequence = rows.reduce((max, row) => Math.max(max, Number(row.sequence) || 0), 0);
    const base = Math.max(maxSequence, itemCount) + itemCount + 1000;
    if (base + itemCount >= 2_147_483_647) {
      throw new BadRequestException('Sequence range is exhausted.');
    }
    return base;
  }

  async detail(versionId: string) {
    const c = this.context();
    const version = await this.assertDraftVersion(versionId);
    const lessons = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,sequence,title,content_type AS "contentType",content_text AS "contentText",
              content_ref AS "contentRef",duration_minutes AS "durationMinutes",is_required AS "isRequired",
              created_at AS "createdAt"
       FROM training_lessons
       WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text
       ORDER BY sequence,id`,
      c.tenantId,
      c.companyId,
      versionId,
    );
    const exams = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT e.id,e.title,e.pass_score AS "passScore",e.max_attempts AS "maxAttempts",e.is_active AS "isActive",
              COALESCE(jsonb_agg(jsonb_build_object(
                'id',q.id,'sequence',q.sequence,'questionType',q.question_type,'prompt',q.prompt,
                'options',q.options,'correctAnswer',q.correct_answer,'points',q.points
              ) ORDER BY q.sequence,q.id) FILTER (WHERE q.id IS NOT NULL),'[]'::jsonb) AS questions
       FROM training_exams e
       LEFT JOIN training_exam_questions q ON q.exam_id=e.id
       WHERE e.tenant_id=$1::text AND e.company_id=$2::text AND e.course_version_id=$3::text
       GROUP BY e.id
       ORDER BY e.created_at,e.id`,
      c.tenantId,
      c.companyId,
      versionId,
    );
    return { ...version, lessons, exams };
  }

  async updateVersion(
    versionId: string,
    input: {
      title?: string;
      description?: string | null;
      theoryPassScore?: number | null;
      practicalPassScore?: number | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    },
  ) {
    const c = this.context();
    const version = await this.assertDraftVersion(versionId);
    const title = input.title === undefined ? version.title : input.title.trim();
    if (!title) throw new BadRequestException('Course version title is required.');

    const theoryPassScore = version.requiresTheory
      ? this.validateScore(input.theoryPassScore ?? version.theoryPassScore ?? 70, 'theoryPassScore')
      : null;
    const practicalPassScore = version.requiresPractical
      ? this.validateScore(input.practicalPassScore ?? version.practicalPassScore ?? 70, 'practicalPassScore')
      : null;
    const effectiveFrom = input.effectiveFrom === undefined ? version.effectiveFrom : input.effectiveFrom;
    const effectiveTo = input.effectiveTo === undefined ? version.effectiveTo : input.effectiveTo;
    if (effectiveFrom && effectiveTo && String(effectiveTo) < String(effectiveFrom)) {
      throw new BadRequestException('effectiveTo cannot be earlier than effectiveFrom.');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_course_versions
       SET title=$4,description=$5,theory_pass_score=$6,practical_pass_score=$7,
           effective_from=$8::date,effective_to=$9::date,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT'
       RETURNING id,course_id AS "courseId",version,status,title,description,delivery_type AS "deliveryType",
                 theory_pass_score AS "theoryPassScore",practical_pass_score AS "practicalPassScore",
                 requires_theory AS "requiresTheory",requires_practical AS "requiresPractical",
                 effective_from AS "effectiveFrom",effective_to AS "effectiveTo"`,
      versionId,
      c.tenantId,
      c.companyId,
      title,
      input.description === undefined ? version.description : input.description?.trim() || null,
      theoryPassScore,
      practicalPassScore,
      effectiveFrom,
      effectiveTo,
    );
    if (!rows.length) throw new NotFoundException('Draft course version not found.');
    return rows[0];
  }

  async createLesson(
    versionId: string,
    input: {
      sequence: number;
      title: string;
      contentType: string;
      contentText?: string | null;
      contentRef?: string | null;
      durationMinutes?: number | null;
      isRequired?: boolean;
    },
    actorUserId: string,
  ) {
    await this.assertDraftVersion(versionId);
    const c = this.context();
    const sequence = Math.trunc(Number(input.sequence));
    const contentType = input.contentType.trim().toUpperCase();
    const title = input.title.trim();
    if (!Number.isInteger(sequence) || sequence < 1) throw new BadRequestException('sequence must be a positive integer.');
    if (!title) throw new BadRequestException('Lesson title is required.');
    if (!['TEXT', 'VIDEO', 'LINK', 'DOCUMENT'].includes(contentType)) throw new BadRequestException('Invalid lesson contentType.');
    const durationMinutes = input.durationMinutes == null ? null : Math.trunc(Number(input.durationMinutes));
    if (durationMinutes != null && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
      throw new BadRequestException('durationMinutes must be a non-negative integer.');
    }
    const contentRef = input.contentRef?.trim() || null;
    if (contentType === 'DOCUMENT') {
      if (!contentRef) throw new BadRequestException('DOCUMENT contentRef is required.');
      await this.assertManagedDocument(versionId, contentRef);
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_lessons(
         tenant_id,company_id,course_version_id,sequence,title,content_type,content_text,content_ref,
         duration_minutes,is_required,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10,$11::text)
       RETURNING id,sequence,title,content_type AS "contentType",content_text AS "contentText",
                 content_ref AS "contentRef",duration_minutes AS "durationMinutes",is_required AS "isRequired"`,
      c.tenantId,
      c.companyId,
      versionId,
      sequence,
      title,
      contentType,
      input.contentText?.trim() || null,
      contentRef,
      durationMinutes,
      input.isRequired !== false,
      actorUserId,
    );
    return rows[0];
  }

  async updateLesson(
    lessonId: string,
    input: {
      title?: string;
      contentType?: string;
      contentText?: string | null;
      contentRef?: string | null;
      durationMinutes?: number | null;
      isRequired?: boolean;
    },
  ) {
    const c = this.context();
    const lesson = await this.draftLesson(lessonId);
    const title = input.title === undefined ? lesson.title : input.title.trim();
    if (!title) throw new BadRequestException('Lesson title is required.');
    const contentType = input.contentType === undefined ? lesson.contentType : input.contentType.trim().toUpperCase();
    if (!['TEXT', 'VIDEO', 'LINK', 'DOCUMENT'].includes(contentType)) throw new BadRequestException('Invalid lesson contentType.');
    const contentRef = input.contentRef === undefined ? lesson.contentRef : input.contentRef?.trim() || null;
    if (contentType === 'DOCUMENT') {
      if (!contentRef) throw new BadRequestException('DOCUMENT contentRef is required.');
      await this.assertManagedDocument(lesson.versionId, contentRef);
    }
    const durationMinutes = input.durationMinutes === undefined ? lesson.durationMinutes : input.durationMinutes;
    if (durationMinutes != null && (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 0)) {
      throw new BadRequestException('durationMinutes must be a non-negative integer.');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_lessons
       SET title=$4,content_type=$5,content_text=$6,content_ref=$7,duration_minutes=$8,is_required=$9,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,sequence,title,content_type AS "contentType",content_text AS "contentText",
                 content_ref AS "contentRef",duration_minutes AS "durationMinutes",is_required AS "isRequired"`,
      lessonId,
      c.tenantId,
      c.companyId,
      title,
      contentType,
      input.contentText === undefined ? lesson.contentText : input.contentText?.trim() || null,
      contentType === 'TEXT' ? null : contentRef,
      durationMinutes == null ? null : Math.trunc(Number(durationMinutes)),
      input.isRequired === undefined ? lesson.isRequired : input.isRequired,
    );
    return rows[0];
  }

  async deleteLesson(lessonId: string) {
    const c = this.context();
    await this.draftLesson(lessonId);
    const deleted = await this.prisma.$executeRawUnsafe(
      `DELETE FROM training_lessons WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      lessonId,
      c.tenantId,
      c.companyId,
    );
    return { id: lessonId, deleted: deleted > 0 };
  }

  async reorderLessons(versionId: string, lessonIds: string[]) {
    const c = this.context();
    await this.assertDraftVersion(versionId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM _advisory_lock`, `training-lessons:${versionId}`);
      const rows = await tx.$queryRawUnsafe(
        `SELECT id,sequence FROM training_lessons
         WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text
         ORDER BY sequence,id FOR UPDATE`,
        c.tenantId,
        c.companyId,
        versionId,
      ) as Array<{ id: string; sequence: number }>;
      const currentIds = rows.map(row => String(row.id));
      if (
        currentIds.length !== lessonIds.length ||
        currentIds.some(id => !lessonIds.includes(id)) ||
        new Set(lessonIds).size !== lessonIds.length
      ) {
        throw new BadRequestException('lessonIds must contain every lesson in the draft exactly once.');
      }
      const temporaryBase = this.temporarySequenceBase(rows, lessonIds.length);
      for (let index = 0; index < lessonIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_lessons SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          lessonIds[index],
          c.tenantId,
          c.companyId,
          temporaryBase + index,
        );
      }
      for (let index = 0; index < lessonIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_lessons SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          lessonIds[index],
          c.tenantId,
          c.companyId,
          index + 1,
        );
      }
      return { versionId, lessonIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateExam(
    examId: string,
    input: { title?: string; passScore?: number; maxAttempts?: number | null; isActive?: boolean },
  ) {
    const c = this.context();
    const exam = await this.draftExam(examId);
    const title = input.title === undefined ? exam.title : input.title.trim();
    if (!title) throw new BadRequestException('Exam title is required.');
    const passScore = input.passScore === undefined
      ? Number(exam.passScore)
      : this.validateScore(input.passScore, 'passScore');
    const maxAttempts = input.maxAttempts === undefined ? exam.maxAttempts : input.maxAttempts;
    if (maxAttempts != null && (!Number.isInteger(Number(maxAttempts)) || Number(maxAttempts) < 1)) {
      throw new BadRequestException('maxAttempts must be at least 1.');
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_exams
       SET title=$4,pass_score=$5,max_attempts=$6,is_active=$7,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,title,pass_score AS "passScore",max_attempts AS "maxAttempts",is_active AS "isActive"`,
      examId,
      c.tenantId,
      c.companyId,
      title,
      passScore,
      maxAttempts == null ? null : Math.trunc(Number(maxAttempts)),
      input.isActive === undefined ? exam.isActive : input.isActive,
    );
    return rows[0];
  }

  async deleteExam(examId: string) {
    const c = this.context();
    await this.draftExam(examId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `DELETE FROM training_exam_questions
         WHERE exam_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        examId,
        c.tenantId,
        c.companyId,
      );
      const deleted = await tx.$executeRawUnsafe(
        `DELETE FROM training_exams
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        examId,
        c.tenantId,
        c.companyId,
      );
      return { id: examId, deleted: deleted > 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateQuestion(
    questionId: string,
    input: {
      questionType?: string;
      prompt?: string;
      options?: unknown;
      correctAnswer?: unknown;
      points?: number;
    },
  ) {
    const c = this.context();
    const question = await this.draftQuestion(questionId);
    const questionType = input.questionType === undefined
      ? question.questionType
      : input.questionType.trim().toUpperCase();
    if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(questionType)) {
      throw new BadRequestException('Invalid questionType.');
    }
    const prompt = input.prompt === undefined ? question.prompt : input.prompt.trim();
    if (!prompt) throw new BadRequestException('Question prompt is required.');
    const points = input.points === undefined ? Number(question.points) : Number(input.points);
    if (!Number.isFinite(points) || points <= 0 || points > 10000) {
      throw new BadRequestException('points must be between 0 and 10000.');
    }
    const correctAnswer = input.correctAnswer === undefined ? question.correctAnswer : input.correctAnswer;
    if (correctAnswer === undefined) throw new BadRequestException('correctAnswer is required.');
    const options = input.options === undefined ? question.options : input.options;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_exam_questions
       SET question_type=$4,prompt=$5,options=$6::jsonb,correct_answer=$7::jsonb,points=$8,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,sequence,question_type AS "questionType",prompt,options,
                 correct_answer AS "correctAnswer",points`,
      questionId,
      c.tenantId,
      c.companyId,
      questionType,
      prompt,
      options == null ? null : JSON.stringify(options),
      JSON.stringify(correctAnswer),
      points,
    );
    return rows[0];
  }

  async deleteQuestion(questionId: string) {
    const c = this.context();
    await this.draftQuestion(questionId);
    const deleted = await this.prisma.$executeRawUnsafe(
      `DELETE FROM training_exam_questions
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
      questionId,
      c.tenantId,
      c.companyId,
    );
    return { id: questionId, deleted: deleted > 0 };
  }

  async reorderQuestions(examId: string, questionIds: string[]) {
    const c = this.context();
    await this.draftExam(examId);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM _advisory_lock`, `training-questions:${examId}`);
      const rows = await tx.$queryRawUnsafe(
        `SELECT id,sequence FROM training_exam_questions
         WHERE tenant_id=$1::text AND company_id=$2::text AND exam_id=$3::text
         ORDER BY sequence,id FOR UPDATE`,
        c.tenantId,
        c.companyId,
        examId,
      ) as Array<{ id: string; sequence: number }>;
      const currentIds = rows.map(row => String(row.id));
      if (
        currentIds.length !== questionIds.length ||
        currentIds.some(id => !questionIds.includes(id)) ||
        new Set(questionIds).size !== questionIds.length
      ) {
        throw new BadRequestException('questionIds must contain every question in the exam exactly once.');
      }
      const temporaryBase = this.temporarySequenceBase(rows, questionIds.length);
      for (let index = 0; index < questionIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_exam_questions SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          questionIds[index],
          c.tenantId,
          c.companyId,
          temporaryBase + index,
        );
      }
      for (let index = 0; index < questionIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_exam_questions SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          questionIds[index],
          c.tenantId,
          c.companyId,
          index + 1,
        );
      }
      return { examId, questionIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private validateScore(value: unknown, field: string) {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new BadRequestException(`${field} must be between 0 and 100.`);
    }
    return score;
  }
}
