import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

export type SupplierVerificationDecision = 'APPROVED' | 'REJECTED';
export type SupplierVerificationDocumentType =
  | 'TAX_REGISTRATION'
  | 'TRADE_REGISTRY'
  | 'AUTHORIZATION'
  | 'BANK_ACCOUNT_PROOF'
  | 'CERTIFICATE'
  | 'OTHER';

export interface RegisterVerificationDocumentInput {
  documentType: SupplierVerificationDocumentType;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  checksumSha256?: string;
}

@Injectable()
export class SupplierVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOrganization(organizationId: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id
       FROM supplier_organizations
       WHERE id=$1 AND status<>'ARCHIVED'
       LIMIT 1`,
      organizationId,
    );

    if (!rows.length) {
      throw new NotFoundException('Supplier organization not found');
    }
  }

  async listCases(organizationId: string) {
    await this.assertOrganization(organizationId);

    return this.prisma.$queryRawUnsafe(
      `SELECT
         id,
         supplier_organization_id AS "supplierOrganizationId",
         status,
         opened_by_user_id AS "openedByUserId",
         reviewed_by_user_id AS "reviewedByUserId",
         submitted_at AS "submittedAt",
         reviewed_at AS "reviewedAt",
         decision_reason AS "decisionReason",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM supplier_verification_cases
       WHERE supplier_organization_id=$1
       ORDER BY created_at DESC`,
      organizationId,
    );
  }

  async openCase(organizationId: string, actorUserId: string) {
    await this.assertOrganization(organizationId);

    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         id,
         supplier_organization_id AS "supplierOrganizationId",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM supplier_verification_cases
       WHERE supplier_organization_id=$1
         AND status IN ('DRAFT','SUBMITTED','IN_REVIEW')
       LIMIT 1`,
      organizationId,
    );

    if (existing.length) {
      return existing[0];
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH opened AS (
         INSERT INTO supplier_verification_cases(
           supplier_organization_id,status,opened_by_user_id
         ) VALUES($1,'DRAFT',$2)
         RETURNING
           id,
           supplier_organization_id AS "supplierOrganizationId",
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"
       ), supplier AS (
         UPDATE supplier_organizations
         SET verification_status='PENDING', updated_at=NOW()
         WHERE id=$1
       ), audit AS (
         INSERT INTO supplier_verification_audit_logs(
           supplier_organization_id,verification_case_id,actor_user_id,
           action,from_status,to_status
         )
         SELECT $1,id,$2,'CASE_OPENED',NULL,'DRAFT'
         FROM opened
       )
       SELECT * FROM opened`,
      organizationId,
      actorUserId,
    );

    return rows[0];
  }

  async registerDocument(
    organizationId: string,
    caseId: string,
    input: RegisterVerificationDocumentInput,
    actorUserId: string,
  ) {
    const cases = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status
       FROM supplier_verification_cases
       WHERE id=$1 AND supplier_organization_id=$2
       LIMIT 1`,
      caseId,
      organizationId,
    );

    if (!cases.length) {
      throw new NotFoundException('Supplier verification case not found');
    }

    if (!['DRAFT', 'SUBMITTED', 'IN_REVIEW'].includes(cases[0].status)) {
      throw new BadRequestException('Verification case is already closed');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH document AS (
         INSERT INTO supplier_verification_documents(
           verification_case_id,document_type,storage_key,file_name,mime_type,
           size_bytes,checksum_sha256,uploaded_by_user_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING
           id,
           verification_case_id AS "verificationCaseId",
           document_type AS "documentType",
           storage_key AS "storageKey",
           file_name AS "fileName",
           mime_type AS "mimeType",
           size_bytes AS "sizeBytes",
           checksum_sha256 AS "checksumSha256",
           status,
           created_at AS "createdAt"
       ), audit AS (
         INSERT INTO supplier_verification_audit_logs(
           supplier_organization_id,verification_case_id,actor_user_id,
           action,from_status,to_status
         ) VALUES($9,$1,$8,'DOCUMENT_REGISTERED',$10,$10)
       )
       SELECT * FROM document`,
      caseId,
      input.documentType,
      input.storageKey.trim(),
      input.fileName.trim(),
      input.mimeType.trim().toLowerCase(),
      input.sizeBytes ?? null,
      input.checksumSha256?.trim().toLowerCase() || null,
      actorUserId,
      organizationId,
      cases[0].status,
    );

    return rows[0];
  }

  async submitCase(
    organizationId: string,
    caseId: string,
    actorUserId: string,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH current_case AS (
         SELECT id,status
         FROM supplier_verification_cases
         WHERE id=$1 AND supplier_organization_id=$2
         LIMIT 1
       ), updated AS (
         UPDATE supplier_verification_cases c
         SET status='SUBMITTED',submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW()
         FROM current_case cc
         WHERE c.id=cc.id AND cc.status='DRAFT'
         RETURNING c.id,c.status,c.submitted_at AS "submittedAt",cc.status AS "fromStatus"
       ), audit AS (
         INSERT INTO supplier_verification_audit_logs(
           supplier_organization_id,verification_case_id,actor_user_id,
           action,from_status,to_status
         )
         SELECT $2,id,$3,'CASE_SUBMITTED',"fromStatus",status
         FROM updated
       )
       SELECT * FROM updated`,
      caseId,
      organizationId,
      actorUserId,
    );

    if (!rows.length) {
      throw new BadRequestException('Only a draft verification case can be submitted');
    }

    return rows[0];
  }

  async decideCase(
    organizationId: string,
    caseId: string,
    decision: SupplierVerificationDecision,
    reason: string | undefined,
    actorUserId: string,
  ) {
    const organizationStatus = decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
    const action = decision === 'APPROVED' ? 'CASE_APPROVED' : 'CASE_REJECTED';

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH current_case AS (
         SELECT id,status
         FROM supplier_verification_cases
         WHERE id=$1 AND supplier_organization_id=$2
         LIMIT 1
       ), decided AS (
         UPDATE supplier_verification_cases c
         SET status=$3,reviewed_by_user_id=$4,reviewed_at=NOW(),decision_reason=$5,updated_at=NOW()
         FROM current_case cc
         WHERE c.id=cc.id AND cc.status IN ('SUBMITTED','IN_REVIEW')
         RETURNING c.id,c.status,c.reviewed_at AS "reviewedAt",cc.status AS "fromStatus"
       ), supplier AS (
         UPDATE supplier_organizations so
         SET verification_status=$6,updated_at=NOW()
         FROM decided d
         WHERE so.id=$2
       ), audit AS (
         INSERT INTO supplier_verification_audit_logs(
           supplier_organization_id,verification_case_id,actor_user_id,
           action,from_status,to_status
         )
         SELECT $2,id,$4,$7,"fromStatus",status
         FROM decided
       )
       SELECT * FROM decided`,
      caseId,
      organizationId,
      decision,
      actorUserId,
      reason?.trim() || null,
      organizationStatus,
      action,
    );

    if (!rows.length) {
      throw new BadRequestException(
        'Only a submitted verification case can be decided',
      );
    }

    return rows[0];
  }
}
