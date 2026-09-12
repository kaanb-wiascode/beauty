import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class TrainingContentStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: ObjectStorageService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
    };
  }

  private keySegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private filename(value?: string | null) {
    const filename = value?.trim() || null;
    if (filename && filename.length > 255) {
      throw new BadRequestException('filename is too long.');
    }
    return filename;
  }

  private mimeType(value?: string | null) {
    const mimeType = value?.trim().toLowerCase() || 'application/octet-stream';
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
      throw new BadRequestException('mimeType is invalid.');
    }
    return mimeType;
  }

  async prepareDocumentUpload(
    versionId: string,
    input: {
      filename?: string | null;
      mimeType?: string | null;
      byteSize?: number | null;
    },
  ) {
    const c = this.context();
    const versions = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,course_id AS "courseId",version
       FROM training_course_versions
       WHERE id=$1::text
         AND tenant_id=$2::text
         AND company_id=$3::text
         AND status='DRAFT'
       LIMIT 1`,
      versionId,
      c.tenantId,
      c.companyId,
    );
    if (!versions.length) {
      throw new NotFoundException('Draft course version not found.');
    }

    const maxBytes = this.storage.maxBytes();
    if (
      input.byteSize != null &&
      (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0)
    ) {
      throw new BadRequestException('byteSize must be a non-negative integer.');
    }
    if (input.byteSize != null && input.byteSize > maxBytes) {
      throw new BadRequestException(`Training document exceeds ${maxBytes} bytes.`);
    }

    const version = versions[0];
    const objectKey = [
      'private',
      'training-content',
      this.keySegment(c.tenantId),
      this.keySegment(c.companyId),
      this.keySegment(version.courseId),
      `v${Number(version.version)}`,
      randomUUID(),
    ].join('/');
    const mimeType = this.mimeType(input.mimeType);
    const signed = await this.storage.presignPut(objectKey, mimeType);
    return {
      objectKey,
      method: 'PUT' as const,
      uploadUrl: signed.url,
      expiresAt: signed.expiresAt,
      requiredHeaders: signed.requiredHeaders,
      maxBytes,
      filename: this.filename(input.filename),
    };
  }

  async verifyDocument(versionId: string, objectKey: string) {
    const c = this.context();
    const versions = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,course_id AS "courseId",version
       FROM training_course_versions
       WHERE id=$1::text
         AND tenant_id=$2::text
         AND company_id=$3::text
         AND status='DRAFT'
       LIMIT 1`,
      versionId,
      c.tenantId,
      c.companyId,
    );
    if (!versions.length) {
      throw new NotFoundException('Draft course version not found.');
    }
    const version = versions[0];
    const expectedPrefix = [
      'private',
      'training-content',
      this.keySegment(c.tenantId),
      this.keySegment(c.companyId),
      this.keySegment(version.courseId),
      `v${Number(version.version)}`,
    ].join('/');
    if (!objectKey?.startsWith(`${expectedPrefix}/`)) {
      throw new BadRequestException('contentRef is outside the managed course version scope.');
    }
    let head: Awaited<ReturnType<ObjectStorageService['head']>>;
    try {
      head = await this.storage.head(objectKey);
    } catch {
      throw new BadRequestException('Uploaded training document was not found.');
    }
    const maxBytes = this.storage.maxBytes();
    if (head.byteSize == null || head.byteSize < 0) {
      throw new BadRequestException('Training document size could not be verified.');
    }
    if (head.byteSize > maxBytes) {
      await this.storage.remove(objectKey).catch(() => undefined);
      throw new BadRequestException(`Training document exceeds ${maxBytes} bytes.`);
    }
    return {
      objectKey,
      byteSize: head.byteSize,
      mimeType: head.mimeType || 'application/octet-stream',
      verified: true,
    };
  }

  async downloadLessonDocument(lessonId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,l.title,l.content_ref AS "contentRef",v.course_id AS "courseId",v.version
       FROM training_lessons l
       JOIN training_course_versions v ON v.id=l.course_version_id
       WHERE l.id=$1::text
         AND l.tenant_id=$2::text
         AND l.company_id=$3::text
         AND l.content_type='DOCUMENT'
         AND l.content_ref IS NOT NULL
       LIMIT 1`,
      lessonId,
      c.tenantId,
      c.companyId,
    );
    if (!rows.length) throw new NotFoundException('Training document lesson not found.');
    const lesson = rows[0];
    const expectedPrefix = [
      'private',
      'training-content',
      this.keySegment(c.tenantId),
      this.keySegment(c.companyId),
      this.keySegment(lesson.courseId),
      `v${Number(lesson.version)}`,
    ].join('/');
    if (!String(lesson.contentRef).startsWith(`${expectedPrefix}/`)) {
      throw new BadRequestException('Lesson does not use managed private storage.');
    }
    const signed = await this.storage.presignGet(
      lesson.contentRef,
      `${lesson.title || 'training-document'}`,
    );
    return {
      lessonId: lesson.id,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  }
}
