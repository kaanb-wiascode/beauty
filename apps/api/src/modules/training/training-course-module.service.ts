import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingCourseModuleService {
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
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT v.id
       FROM training_course_versions v
       JOIN training_courses c ON c.id=v.course_id
       WHERE v.id=$1::text AND v.tenant_id=$2::text AND v.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      versionId,
      c.tenantId,
      c.companyId,
    );
    if (!rows.length) throw new NotFoundException('Draft course version not found.');
  }

  private async module(moduleId: string, tx: any = this.prisma) {
    const c = this.context();
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT m.id,m.course_version_id AS "versionId",m.sequence,m.title,m.description
       FROM training_course_modules m
       JOIN training_course_versions v ON v.id=m.course_version_id
       JOIN training_courses c ON c.id=v.course_id
       WHERE m.id=$1::text AND m.tenant_id=$2::text AND m.company_id=$3::text
         AND v.status='DRAFT' AND c.is_active=true
       LIMIT 1`,
      moduleId,
      c.tenantId,
      c.companyId,
    );
    if (!rows.length) throw new NotFoundException('Course module not found on active draft.');
    return rows[0];
  }

  async list(versionId: string) {
    await this.assertDraftVersion(versionId);
    const c = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id,m.sequence,m.title,m.description,
              COALESCE(jsonb_agg(l.id ORDER BY l.sequence,l.id) FILTER (WHERE l.id IS NOT NULL),'[]'::jsonb) AS "lessonIds"
       FROM training_course_modules m
       LEFT JOIN training_lessons l ON l.module_id=m.id
       WHERE m.tenant_id=$1::text AND m.company_id=$2::text AND m.course_version_id=$3::text
       GROUP BY m.id
       ORDER BY m.sequence,m.id`,
      c.tenantId,
      c.companyId,
      versionId,
    );
  }

  async create(versionId: string, input: { title: string; description?: string | null }, actorUserId: string) {
    await this.assertDraftVersion(versionId);
    const c = this.context();
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Module title is required.');

    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `training-modules:${versionId}`);
      const nextRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(MAX(sequence),0)+1 AS sequence
         FROM training_course_modules
         WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text`,
        c.tenantId,
        c.companyId,
        versionId,
      );
      const sequence = Number(nextRows[0]?.sequence ?? 1);
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO training_course_modules(tenant_id,company_id,course_version_id,sequence,title,description,created_by_user_id)
         VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::text)
         RETURNING id,sequence,title,description`,
        c.tenantId,
        c.companyId,
        versionId,
        sequence,
        title,
        input.description?.trim() || null,
        actorUserId,
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(moduleId: string, input: { title?: string; description?: string | null }) {
    const current = await this.module(moduleId);
    const c = this.context();
    const title = input.title === undefined ? current.title : input.title.trim();
    if (!title) throw new BadRequestException('Module title is required.');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_course_modules
       SET title=$4,description=$5,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,sequence,title,description`,
      moduleId,
      c.tenantId,
      c.companyId,
      title,
      input.description === undefined ? current.description : input.description?.trim() || null,
    );
    return rows[0];
  }

  async remove(moduleId: string) {
    await this.module(moduleId);
    const c = this.context();
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `UPDATE training_lessons SET module_id=NULL,updated_at=now()
         WHERE tenant_id=$1::text AND company_id=$2::text AND module_id=$3::text`,
        c.tenantId,
        c.companyId,
        moduleId,
      );
      const deleted = await tx.$executeRawUnsafe(
        `DELETE FROM training_course_modules WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        moduleId,
        c.tenantId,
        c.companyId,
      );
      return { id: moduleId, deleted: deleted > 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reorder(versionId: string, moduleIds: string[]) {
    await this.assertDraftVersion(versionId);
    const c = this.context();
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `training-modules:${versionId}`);
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,sequence FROM training_course_modules
         WHERE tenant_id=$1::text AND company_id=$2::text AND course_version_id=$3::text
         ORDER BY sequence,id FOR UPDATE`,
        c.tenantId,
        c.companyId,
        versionId,
      );
      const currentIds = rows.map(row => String(row.id));
      if (currentIds.length !== moduleIds.length || currentIds.some(id => !moduleIds.includes(id)) || new Set(moduleIds).size !== moduleIds.length) {
        throw new BadRequestException('moduleIds must contain every module in the draft exactly once.');
      }
      const maxSequence = rows.reduce((max, row) => Math.max(max, Number(row.sequence) || 0), 0);
      const stagingBase = maxSequence + moduleIds.length + 1000;
      for (let index = 0; index < moduleIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_course_modules SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          moduleIds[index], c.tenantId, c.companyId, stagingBase + index,
        );
      }
      for (let index = 0; index < moduleIds.length; index += 1) {
        await tx.$executeRawUnsafe(
          `UPDATE training_course_modules SET sequence=$4,updated_at=now()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
          moduleIds[index], c.tenantId, c.companyId, index + 1,
        );
      }
      return { versionId, moduleIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assignLesson(moduleId: string, lessonId: string) {
    const target = await this.module(moduleId);
    const c = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE training_lessons l
       SET module_id=$4::text,updated_at=now()
       FROM training_course_versions v, training_courses c
       WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
         AND l.course_version_id=$5::text
         AND v.id=l.course_version_id AND v.status='DRAFT'
         AND c.id=v.course_id AND c.is_active=true`,
      lessonId,
      c.tenantId,
      c.companyId,
      moduleId,
      target.versionId,
    );
    if (!updated) throw new NotFoundException('Lesson not found on the same active draft.');
    return { lessonId, moduleId };
  }

  async unassignLesson(lessonId: string) {
    const c = this.context();
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE training_lessons l
       SET module_id=NULL,updated_at=now()
       FROM training_course_versions v, training_courses c
       WHERE l.id=$1::text AND l.tenant_id=$2::text AND l.company_id=$3::text
         AND v.id=l.course_version_id AND v.status='DRAFT'
         AND c.id=v.course_id AND c.is_active=true`,
      lessonId,
      c.tenantId,
      c.companyId,
    );
    if (!updated) throw new NotFoundException('Lesson not found on active draft.');
    return { lessonId, moduleId: null };
  }
}
