import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type EvidenceSubject =
  | 'INSPECTION'
  | 'INSPECTION_RESULT'
  | 'FINDING'
  | 'QUALITY_CASE'
  | 'CAPA';

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

  async add(
    input: {
      subjectType: string;
      subjectId: string;
      kind: 'PHOTO' | 'DOCUMENT' | 'OTHER';
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
