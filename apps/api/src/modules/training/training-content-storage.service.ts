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

  private async draftVersion(versionId: string) {
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
    if (!versions.length) throw new NotFoundException('Draft course version not found.');
    return versions[0];
  }

  private expectedPrefix(version: { courseId: string; version: number }) {
    const c = this.context();
    return [
      'private',
      'training-content',
      this.keySegment(c.tenantId),
      this.keySegment(c.companyId),
      this.keySegment(version.courseId),
      `v${Number(version.version)}`,
    ].join('/');
  }

  async prepareDocumentUpload(
    versionId: string,
    input: { filename?: string | null; mimeType?: string | null; byteSize?: number | null },
  ) {
    const version = await this.draftVersion(versionId);
    const maxBytes = this.storage.maxBytes();
    if (input.byteSize != null && (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0)) {
      throw new BadRequestException('byteSize must be a non-negative integer.');
    }
    if (input.byteSize != null && input.byteSize > maxBytes) {
      throw new BadRequestException(`Training document exceeds ${maxBytes} bytes.`);
    }

    const objectKey = `${this.expectedPrefix(version)}/${randomUUID()}`;
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
    const version = await this.draftVersion(versionId);
    const expectedPrefix = this.expectedPrefix(version);
    if (!objectKey?.startsWith(`${expectedPrefix}/`)) {
      throw new BadRequestException('contentRef is outside the managed course version scope.');
    }

    let head: Awaited<ReturnType<ObjectStorageService['head']>>;
    try {
      head = await this.storage.head(objectKey);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
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

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO training_managed_documents(
         tenant_id,company_id,course_version_id,object_key,mime_type,byte_size,etag,verified_at
       ) VALUES($1::text,$2::text,$3::text,$4,$5,$6::bigint,$7,NOW())
       ON CONFLICT(tenant_id,company_id,object_key)
       DO UPDATE SET mime_type=EXCLUDED.mime_type,byte_size=EXCLUDED.byte_size,etag=EXCLUDED.etag,verified_at=NOW()
       WHERE training_managed_documents.course_version_id=EXCLUDED.course_version_id
       RETURNING id,object_key AS "objectKey",mime_type AS "mimeType",byte_size AS "byteSize",
                 etag,verified_at AS "verifiedAt",course_version_id AS "courseVersionId"`,
      c.tenantId,
      c.companyId,
      versionId,
      objectKey,
      head.mimeType || 'application/octet-stream',
      head.byteSize,
      head.etag ?? null,
    );
    if (!rows.length) {
      throw new BadRequestException('Managed document is already bound to a different course version.');
    }

    return { ...rows[0], verified: true };
  }

  async downloadLessonDocument(lessonId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,l.title,l.content_ref AS "contentRef",v.course_id AS "courseId",v.version
       FROM training_lessons l
       JOIN training_course_versions v ON v.id=l.course_version_id
       JOIN training_managed_documents d
         ON d.tenant_id=l.tenant_id
        AND d.company_id=l.company_id
        AND d.course_version_id=l.course_version_id
        AND d.object_key=l.content_ref
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
    if (!rows.length) throw new NotFoundException('Verified training document lesson not found.');
    const lesson = rows[0];
    const expectedPrefix = this.expectedPrefix({ courseId: lesson.courseId, version: Number(lesson.version) });
    if (!String(lesson.contentRef).startsWith(`${expectedPrefix}/`)) {
      throw new BadRequestException('Lesson does not use managed private storage.');
    }
    const signed = await this.storage.presignGet(lesson.contentRef, `${lesson.title || 'training-document'}`);
    return {
      lessonId: lesson.id,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  }
}
