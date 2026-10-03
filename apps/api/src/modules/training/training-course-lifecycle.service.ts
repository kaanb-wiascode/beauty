import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingCourseLifecycleService {
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

  async archive(courseId: string) {
    const c = this.context();
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM _advisory_lock`,
        `training-course-lifecycle:${c.tenantId}:${c.companyId}:${courseId}`,
      );
      const courses = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,code,title,is_active AS "isActive"
         FROM training_courses
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         FOR UPDATE`,
        courseId,
        c.tenantId,
        c.companyId,
      );
      if (!courses.length) throw new NotFoundException('Training course not found.');

      const retiredVersions = await tx.$executeRawUnsafe(
        `UPDATE training_course_versions
         SET status='RETIRED',effective_to=COALESCE(effective_to,CURRENT_DATE),updated_at=now()
         WHERE tenant_id=$1::text AND company_id=$2::text AND course_id=$3::text
           AND status IN ('DRAFT','PUBLISHED')`,
        c.tenantId,
        c.companyId,
        courseId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE training_courses
         SET is_active=false,updated_at=now()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,
        courseId,
        c.tenantId,
        c.companyId,
      );
      return {
        id: courseId,
        code: courses[0].code,
        title: courses[0].title,
        isActive: false,
        retiredVersions,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async restore(courseId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE training_courses
       SET is_active=true,updated_at=now()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
       RETURNING id,code,title,is_active AS "isActive"`,
      courseId,
      c.tenantId,
      c.companyId,
    );
    if (!rows.length) throw new NotFoundException('Training course not found.');
    return rows[0];
  }
}
