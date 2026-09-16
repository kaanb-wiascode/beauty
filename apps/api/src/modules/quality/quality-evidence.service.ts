import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { TenantContext } from '../../common/tenant/tenant-context';

type EvidenceSubject =
  | 'INSPECTION'
  | 'INSPECTION_RESULT'
  | 'FINDING'
  | 'QUALITY_CASE'
  | 'CAPA';

type EvidenceKind = 'PHOTO' | 'DOCUMENT' | 'OTHER';

const subjectMap: Record<
  EvidenceSubject,
  { table: string; idColumn: string; evidenceColumn: string }
> = {
  INSPECTION: {
    table: 'quality_inspections',
    idColumn: 'id',
    evidenceColumn: 'inspection_id',
  },
  INSPECTION_RESULT: {
    table: 'quality_inspection_results',
    idColumn: 'id',
    evidenceColumn: 'inspection_result_id',
  },
  FINDING: {
    table: 'quality_findings',
    idColumn: 'id',
    evidenceColumn: 'finding_id',
  },
  QUALITY_CASE: {
    table: 'quality_cases',
    idColumn: 'id',
    evidenceColumn: 'quality_case_id',
  },
  CAPA: {
    table: 'quality_capa_plans',
    idColumn: 'id',
    evidenceColumn: 'capa_id',
  },
};

@Injectable()
export class QualityEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly storage: ObjectStorageService,
  ) {}

  private context() {
    return this.tenant.getContext();
  }

  private subject(subjectType: string) {
    const normalized = subjectType?.trim().toUpperCase() as EvidenceSubject;
    const config = subjectMap[normalized];
    if (!config) throw new BadRequestException('Unsupported evidence subjectType.');
    return { type: normalized, ...config };
  }

  private kind(kind: string): EvidenceKind {
    const normalized = kind?.trim().toUpperCase() as EvidenceKind;
    if (!['PHOTO', 'DOCUMENT', 'OTHER'].includes(normalized)) {
      throw new BadRequestException('Unsupported evidence kind.');
    }
    return normalized;
  }

  private filename(value?: string | null) {
    const filename = value?.trim() || null;
    if (filename && filename.length > 255) {
      throw new BadRequestException('originalFilename is too long.');
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

  private keySegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private managedPrefix(
    subjectType: EvidenceSubject,
    subjectId: string,
    branchId: string,
  ) {
    const c = this.context();
    return [
      'private',
      'quality-evidence',
      this.keySegment(c.tenantId),
      this.keySegment(c.companyId),
      this.keySegment(branchId),
      subjectType,
      this.keySegment(subjectId),
    ].join('/');
  }

  private async assertSubjectScope(subjectType: string, subjectId: string) {
    const c = this.context();
    const subject = this.subject(subjectType);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ${subject.idColumn} AS id,branch_id AS "branchId"
       FROM ${subject.table}
       WHERE ${subject.idColumn}=$1::text
         AND tenant_id=$2::text
         AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      subjectId,
      c.tenantId,
      c.companyId,
      c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Evidence subject not found.');
    return { ...subject, branchId: rows[0].branchId as string };
  }

  async prepareUpload(input: {
    subjectType: string;
    subjectId: string;
    kind: string;
    originalFilename?: string | null;
    mimeType?: string | null;
    byteSize?: number | null;
  }) {
    const subject = await this.assertSubjectScope(
      input.subjectType,
      input.subjectId,
    );
    const kind = this.kind(input.kind);
    const originalFilename = this.filename(input.originalFilename);
    const mimeType = this.mimeType(input.mimeType);
    const maxBytes = this.storage.maxBytes();
    if (
      input.byteSize != null &&
      (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0)
    ) {
      throw new BadRequestException('byteSize must be a non-negative integer.');
    }
    if (input.byteSize != null && input.byteSize > maxBytes) {
      throw new BadRequestException(`Evidence file exceeds ${maxBytes} bytes.`);
    }
    const objectKey = `${this.managedPrefix(subject.type, input.subjectId, subject.branchId)}/${randomUUID()}`;
    const upload = await this.storage.presignPut(objectKey, mimeType);
    return {
      objectKey,
      method: 'PUT' as const,
      uploadUrl: upload.url,
      expiresAt: upload.expiresAt,
      requiredHeaders: upload.requiredHeaders,
      maxBytes,
      kind,
      originalFilename,
    };
  }

  async finalizeUpload(
    input: {
      subjectType: string;
      subjectId: string;
      kind: string;
      objectKey: string;
      originalFilename?: string | null;
      note?: string | null;
      capturedAt?: string | null;
      sha256?: string | null;
    },
    actorUserId: string,
  ) {
    const subject = await this.assertSubjectScope(
      input.subjectType,
      input.subjectId,
    );
    const objectKey = input.objectKey?.trim();
    const prefix = `${this.managedPrefix(subject.type, input.subjectId, subject.branchId)}/`;
    if (!objectKey || !objectKey.startsWith(prefix)) {
      throw new BadRequestException('objectKey is outside the managed evidence scope.');
    }

    let head: Awaited<ReturnType<ObjectStorageService['head']>>;
    try {
      head = await this.storage.head(objectKey);
    } catch {
      throw new BadRequestException('Uploaded evidence object was not found.');
    }
    const maxBytes = this.storage.maxBytes();
    if (head.byteSize == null || head.byteSize < 0) {
      throw new BadRequestException('Uploaded evidence size could not be verified.');
    }
    if (head.byteSize > maxBytes) {
      await this.storage.remove(objectKey).catch(() => undefined);
      throw new BadRequestException(`Evidence file exceeds ${maxBytes} bytes.`);
    }

    return this.add(
      {
        subjectType: subject.type,
        subjectId: input.subjectId,
        kind: this.kind(input.kind),
        objectKey,
        originalFilename: this.filename(input.originalFilename),
        mimeType: head.mimeType || 'application/octet-stream',
        byteSize: head.byteSize,
        sha256: input.sha256 ?? null,
        note: input.note ?? null,
        capturedAt: input.capturedAt ?? null,
      },
      actorUserId,
    );
  }

  async download(evidenceId: string) {
    const c = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,object_key AS "objectKey",original_filename AS "originalFilename",mime_type AS "mimeType"
       FROM quality_evidence
       WHERE id=$1::text
         AND tenant_id=$2::text
         AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      evidenceId,
      c.tenantId,
      c.companyId,
      c.branchId,
    );
    if (!rows.length) throw new NotFoundException('Evidence not found.');
    const signed = await this.storage.presignGet(
      rows[0].objectKey,
      rows[0].originalFilename,
    );
    return {
      evidenceId: rows[0].id,
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
      originalFilename: rows[0].originalFilename,
      mimeType: rows[0].mimeType,
    };
  }

  async add(
    input: {
      subjectType: string;
      subjectId: string;
      kind: EvidenceKind;
      objectKey: string;
      originalFilename?: string | null;
      mimeType?: string | null;
      byteSize?: number | null;
      sha256?: string | null;
      note?: string | null;
      capturedAt?: string | null;
    },
    actorUserId: string,
  ) {
    const objectKey = input.objectKey?.trim();
    if (!objectKey || /^https?:\/\//i.test(objectKey)) {
      throw new BadRequestException(
        'objectKey must be a non-public opaque storage key.',
      );
    }
    if (!['PHOTO', 'DOCUMENT', 'OTHER'].includes(input.kind)) {
      throw new BadRequestException('Unsupported evidence kind.');
    }
    if (
      input.byteSize != null &&
      (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0)
    ) {
      throw new BadRequestException('byteSize must be a non-negative integer.');
    }
    const sha256 = input.sha256?.trim().toLowerCase() || null;
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new BadRequestException('sha256 must be a 64-character hex digest.');
    }
    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : null;
    if (capturedAt && Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('capturedAt is invalid.');
    }

    const subject = await this.assertSubjectScope(
      input.subjectType,
      input.subjectId,
    );
    const c = this.context();
    const columns = [
      'inspection_id',
      'inspection_result_id',
      'finding_id',
      'quality_case_id',
      'capa_id',
    ];
    const parentValues = columns.map((column) =>
      column === subject.evidenceColumn ? input.subjectId : null,
    );

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO quality_evidence(
         tenant_id,company_id,branch_id,
         inspection_id,inspection_result_id,finding_id,quality_case_id,capa_id,
         kind,object_key,original_filename,mime_type,byte_size,sha256,note,captured_at,
         uploaded_by_user_id
       )
       VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,
         $9,$10,$11,$12,$13::bigint,$14,$15,$16,$17::text
       )
       ON CONFLICT (tenant_id,company_id,object_key) DO NOTHING
       RETURNING id,kind,object_key AS "objectKey",original_filename AS "originalFilename",
                 mime_type AS "mimeType",byte_size AS "byteSize",sha256,note,
                 captured_at AS "capturedAt",created_at AS "createdAt"`,
      c.tenantId,
      c.companyId,
      subject.branchId,
      ...parentValues,
      input.kind,
      objectKey,
      input.originalFilename?.trim() || null,
      input.mimeType?.trim() || null,
      input.byteSize ?? null,
      sha256,
      input.note?.trim() || null,
      capturedAt,
      actorUserId,
    );

    if (rows.length) return { ...rows[0], duplicate: false };
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,kind,object_key AS "objectKey",original_filename AS "originalFilename",
              mime_type AS "mimeType",byte_size AS "byteSize",sha256,note,
              captured_at AS "capturedAt",created_at AS "createdAt"
       FROM quality_evidence
       WHERE tenant_id=$1::text AND company_id=$2::text AND object_key=$3
       LIMIT 1`,
      c.tenantId,
      c.companyId,
      objectKey,
    );
    return { ...existing[0], duplicate: true };
  }

  async list(subjectType: string, subjectId: string, limit = 100) {
    const subject = await this.assertSubjectScope(subjectType, subjectId);
    const c = this.context();
    const bounded = Math.min(Math.max(limit, 1), 200);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,kind,object_key AS "objectKey",original_filename AS "originalFilename",
              mime_type AS "mimeType",byte_size AS "byteSize",sha256,note,
              captured_at AS "capturedAt",uploaded_by_user_id AS "uploadedByUserId",
              created_at AS "createdAt"
       FROM quality_evidence
       WHERE tenant_id=$1::text
         AND company_id=$2::text
         AND branch_id=$3::text
         AND ${subject.evidenceColumn}=$4::text
       ORDER BY created_at DESC
       LIMIT $5`,
      c.tenantId,
      c.companyId,
      subject.branchId,
      subjectId,
      bounded,
    );
  }
}
