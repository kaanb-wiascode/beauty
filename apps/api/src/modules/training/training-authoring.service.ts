import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
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

  private async assertDraftVersion(versionId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT v.id,v.course_id AS "courseId",v.version,v.status,v.title,v.description,
              v.delivery_type AS "deliveryType",v.theory_pass_score AS "theoryPassScore",
              v.practical_pass_score AS "practicalPassScore",v.requires_theory AS "requiresTheory",
              v.requires_practical AS "requiresPractical",v.effective_from AS "effectiveFrom",
              v.effective_to AS "effectiveTo"
       FROM training_course_versions v
       WHERE v.id=$1::text AND v.tenant_id=$2::text AND v.company_id=$3::text AND v.status='DRAFT'
       LIMIT 1`,
      versionId,
      c.tenantId,
      c.companyId,
    );
    if (!rows.length) throw new NotFoundException('Draft course version not found.');
    return rows[0];
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
                'options',q.options,'points',q.points
              ) ORDER BY q.sequence) FILTER (WHERE q.id IS NOT NULL),'[]'::jsonb) AS questions
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

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_course_versions
       SET title=$4,
           description=$5,
           theory_pass_score=$6,
           practical_pass_score=$7,
           effective_from=$8::date,
           effective_to=$9::date,
           updated_at=now()
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
      input.effectiveFrom === undefined ? version.effectiveFrom : input.effectiveFrom,
      input.effectiveTo === undefined ? version.effectiveTo : input.effectiveTo,
    );
    if (!rows.length) throw new NotFoundException('Draft course version not found.');
    return rows[0];
  }

  private validateScore(value: unknown, field: string) {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new BadRequestException(`${field} must be between 0 and 100.`);
    }
    return score;
  }
}
