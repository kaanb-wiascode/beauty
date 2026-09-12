import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

@Injectable()
export class TrainingQuestionBankService {
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

  private normalizeType(value: unknown): QuestionType {
    const type = String(value ?? '').trim().toUpperCase();
    if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type)) {
      throw new BadRequestException('Invalid questionType.');
    }
    return type as QuestionType;
  }

  private validateContent(input: {
    questionType: unknown;
    prompt: unknown;
    options?: unknown;
    correctAnswer: unknown;
    defaultPoints?: unknown;
  }) {
    const questionType = this.normalizeType(input.questionType);
    const prompt = String(input.prompt ?? '').trim();
    const defaultPoints = Number(input.defaultPoints ?? 1);
    if (!prompt) throw new BadRequestException('Question prompt is required.');
    if (input.correctAnswer === undefined) throw new BadRequestException('correctAnswer is required.');
    if (!Number.isFinite(defaultPoints) || defaultPoints <= 0) {
      throw new BadRequestException('defaultPoints must be greater than zero.');
    }
    return { questionType, prompt, defaultPoints };
  }

  async create(
    input: {
      code: string;
      category?: string;
      questionType: QuestionType;
      prompt: string;
      options?: unknown;
      correctAnswer: unknown;
      defaultPoints?: number;
      tags?: string[];
    },
    actorUserId: string,
  ) {
    const c = this.context();
    const code = input.code?.trim().toUpperCase();
    const category = input.category?.trim().toUpperCase() || 'GENERAL';
    if (!code) throw new BadRequestException('Question code is required.');
    const content = this.validateContent(input);
    const tags = Array.from(new Set((input.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 25);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1))`,
          `training-question-bank:${c.tenantId}:${c.companyId}:${code}`,
        );
        const versions = await tx.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(MAX(version),0)+1 AS version
           FROM training_question_bank_questions
           WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3`,
          c.tenantId,
          c.companyId,
          code,
        );
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_question_bank_questions(
             tenant_id,company_id,code,version,status,category,question_type,prompt,
             options,correct_answer,default_points,tags,created_by_user_id
           ) VALUES($1::text,$2::text,$3,$4,'DRAFT',$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::text[],$12::text)
           RETURNING id,code,version,status,category,question_type AS "questionType",prompt,
                     options,default_points AS "defaultPoints",tags,created_at AS "createdAt"`,
          c.tenantId,
          c.companyId,
          code,
          Number(versions[0]?.version ?? 1),
          category,
          content.questionType,
          content.prompt,
          input.options == null ? null : JSON.stringify(input.options),
          JSON.stringify(input.correctAnswer),
          content.defaultPoints,
          tags,
          actorUserId,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(input: { status?: string; category?: string; limit?: number } = {}) {
    const c = this.context();
    const status = input.status?.trim().toUpperCase() || null;
    if (status && !['DRAFT', 'PUBLISHED', 'RETIRED'].includes(status)) {
      throw new BadRequestException('Invalid question bank status.');
    }
    const category = input.category?.trim().toUpperCase() || null;
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,code,version,status,category,question_type AS "questionType",prompt,options,
              correct_answer AS "correctAnswer",default_points AS "defaultPoints",tags,
              published_at AS "publishedAt",created_at AS "createdAt"
       FROM training_question_bank_questions
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR status=$3::text)
         AND ($4::text IS NULL OR category=$4::text)
       ORDER BY code,version DESC
       LIMIT $5`,
      c.tenantId,
      c.companyId,
      status,
      category,
      limit,
    );
  }

  async publish(questionId: string, actorUserId: string) {
    const c = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,code,version,status
           FROM training_question_bank_questions
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
           FOR UPDATE`,
          questionId,
          c.tenantId,
          c.companyId,
        );
        if (!rows.length) throw new NotFoundException('Question bank item not found.');
        const question = rows[0];
        if (question.status === 'PUBLISHED') return { ...question, duplicate: true };
        if (question.status !== 'DRAFT') throw new BadRequestException('Only a draft bank question can be published.');
        await tx.$executeRawUnsafe(
          `UPDATE training_question_bank_questions
           SET status='RETIRED',updated_at=NOW()
           WHERE tenant_id=$1::text AND company_id=$2::text AND code=$3 AND status='PUBLISHED'`,
          c.tenantId,
          c.companyId,
          question.code,
        );
        const published = await tx.$queryRawUnsafe<any[]>(
          `UPDATE training_question_bank_questions
           SET status='PUBLISHED',published_by_user_id=$2::text,published_at=NOW(),updated_at=NOW()
           WHERE id=$1::text
           RETURNING id,code,version,status,published_at AS "publishedAt"`,
          questionId,
          actorUserId,
        );
        return { ...published[0], duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async addToExam(
    examId: string,
    questionId: string,
    input: { sequence: number; points?: number },
    actorUserId: string,
  ) {
    const c = this.context();
    const sequence = Math.trunc(Number(input.sequence));
    const overridePoints = input.points == null ? null : Number(input.points);
    if (!Number.isInteger(sequence) || sequence < 1) throw new BadRequestException('sequence must be a positive integer.');
    if (overridePoints != null && (!Number.isFinite(overridePoints) || overridePoints <= 0)) {
      throw new BadRequestException('points must be greater than zero.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const exams = await tx.$queryRawUnsafe<any[]>(
          `SELECT e.id
           FROM training_exams e
           JOIN training_course_versions v ON v.id=e.course_version_id
           WHERE e.id=$1::text AND e.tenant_id=$2::text AND e.company_id=$3::text
             AND v.status='DRAFT'
           LIMIT 1
           FOR UPDATE OF e`,
          examId,
          c.tenantId,
          c.companyId,
        );
        if (!exams.length) throw new NotFoundException('Exam on draft course version not found.');

        const questions = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,version,question_type AS "questionType",prompt,options,
                  correct_answer AS "correctAnswer",default_points AS "defaultPoints"
           FROM training_question_bank_questions
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='PUBLISHED'
           LIMIT 1`,
          questionId,
          c.tenantId,
          c.companyId,
        );
        if (!questions.length) throw new NotFoundException('Published question bank item not found.');
        const question = questions[0];
        const points = overridePoints ?? Number(question.defaultPoints);

        const inserted = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO training_exam_questions(
             tenant_id,company_id,exam_id,sequence,question_type,prompt,options,correct_answer,
             points,created_by_user_id,question_bank_id,question_bank_version
           ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::text,$11::text,$12)
           RETURNING id,sequence,question_type AS "questionType",prompt,options,points,
                     question_bank_id AS "questionBankId",question_bank_version AS "questionBankVersion"`,
          c.tenantId,
          c.companyId,
          examId,
          sequence,
          question.questionType,
          question.prompt,
          question.options == null ? null : JSON.stringify(question.options),
          JSON.stringify(question.correctAnswer),
          points,
          actorUserId,
          question.id,
          Number(question.version),
        );
        return inserted[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
