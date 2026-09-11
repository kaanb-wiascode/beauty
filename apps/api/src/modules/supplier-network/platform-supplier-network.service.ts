import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

interface PlatformSupplierListInput {
  status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  limit?: number;
}

export type SupplierOrganizationType =
  | 'MANUFACTURER'
  | 'DISTRIBUTOR'
  | 'IMPORTER'
  | 'WHOLESALER'
  | 'RETAILER'
  | 'SERVICE_PROVIDER'
  | 'OTHER';

export interface CreateSupplierOrganizationInput {
  slug: string;
  legalName: string;
  displayName: string;
  organizationType: SupplierOrganizationType;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  taxCountry?: string | null;
  taxNumber?: string | null;
}

export interface UpdateSupplierOrganizationInput {
  legalName?: string;
  displayName?: string;
  organizationType?: SupplierOrganizationType;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  taxCountry?: string | null;
  taxNumber?: string | null;
}

@Injectable()
export class PlatformSupplierNetworkService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations(input: PlatformSupplierListInput = {}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

    return this.prisma.$queryRawUnsafe(
      `SELECT
         id,slug,legal_name AS "legalName",display_name AS "displayName",
         organization_type AS "organizationType",status,
         verification_status AS "verificationStatus",
         website,email,phone,tax_country AS "taxCountry",tax_number AS "taxNumber",
         created_at AS "createdAt",updated_at AS "updatedAt"
       FROM supplier_organizations
       WHERE ($1::text IS NULL OR status=$1::text)
       ORDER BY created_at DESC
       LIMIT $2::int`,
      input.status ?? null,
      limit,
    );
  }

  async getOrganization(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         id,slug,legal_name AS "legalName",display_name AS "displayName",
         organization_type AS "organizationType",status,
         verification_status AS "verificationStatus",
         website,email,phone,tax_country AS "taxCountry",tax_number AS "taxNumber",
         created_at AS "createdAt",updated_at AS "updatedAt"
       FROM supplier_organizations
       WHERE id=$1
       LIMIT 1`,
      id,
    );

    if (!rows.length) {
      throw new NotFoundException('Supplier organization not found');
    }

    return rows[0];
  }

  async createOrganization(
    input: CreateSupplierOrganizationInput,
    actorUserId: string,
  ) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `WITH organization AS (
           INSERT INTO supplier_organizations(
             slug,legal_name,display_name,organization_type,status,
             website,email,phone,tax_country,tax_number
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *
         ), audit AS (
           INSERT INTO supplier_platform_audit_logs(
             supplier_organization_id,actor_user_id,action,changed_fields,metadata
           )
           SELECT
             id,$11,'CREATE',
             ARRAY[
               'slug','legalName','displayName','organizationType','status',
               'website','email','phone','taxIdentity'
             ]::text[],
             jsonb_build_object(
               'organizationType',organization_type,
               'status',status,
               'verificationStatus',verification_status,
               'hasTaxIdentity',(tax_country IS NOT NULL AND tax_number IS NOT NULL)
             )
           FROM organization
         )
         SELECT
           id,slug,legal_name AS "legalName",display_name AS "displayName",
           organization_type AS "organizationType",status,
           verification_status AS "verificationStatus",
           website,email,phone,tax_country AS "taxCountry",tax_number AS "taxNumber",
           created_at AS "createdAt",updated_at AS "updatedAt"
         FROM organization`,
        input.slug,
        input.legalName,
        input.displayName,
        input.organizationType,
        input.status,
        input.website ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.taxCountry ?? null,
        input.taxNumber ?? null,
        actorUserId,
      );

      return rows[0];
    } catch (error) {
      this.rethrowMutationError(error);
    }
  }

  async updateOrganization(
    id: string,
    input: UpdateSupplierOrganizationInput,
    actorUserId: string,
  ) {
    const payload = JSON.stringify(input);

    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `WITH organization AS (
           UPDATE supplier_organizations
           SET
             legal_name=CASE WHEN $2::jsonb ? 'legalName' THEN $2::jsonb->>'legalName' ELSE legal_name END,
             display_name=CASE WHEN $2::jsonb ? 'displayName' THEN $2::jsonb->>'displayName' ELSE display_name END,
             organization_type=CASE WHEN $2::jsonb ? 'organizationType' THEN $2::jsonb->>'organizationType' ELSE organization_type END,
             status=CASE WHEN $2::jsonb ? 'status' THEN $2::jsonb->>'status' ELSE status END,
             website=CASE WHEN $2::jsonb ? 'website' THEN $2::jsonb->>'website' ELSE website END,
             email=CASE WHEN $2::jsonb ? 'email' THEN $2::jsonb->>'email' ELSE email END,
             phone=CASE WHEN $2::jsonb ? 'phone' THEN $2::jsonb->>'phone' ELSE phone END,
             tax_country=CASE WHEN $2::jsonb ? 'taxCountry' THEN $2::jsonb->>'taxCountry' ELSE tax_country END,
             tax_number=CASE WHEN $2::jsonb ? 'taxNumber' THEN $2::jsonb->>'taxNumber' ELSE tax_number END,
             updated_at=NOW()
           WHERE id=$1
           RETURNING *
         ), audit AS (
           INSERT INTO supplier_platform_audit_logs(
             supplier_organization_id,actor_user_id,action,changed_fields,metadata
           )
           SELECT
             id,$3,'UPDATE',
             ARRAY_REMOVE(ARRAY[
               CASE WHEN $2::jsonb ? 'legalName' THEN 'legalName' END,
               CASE WHEN $2::jsonb ? 'displayName' THEN 'displayName' END,
               CASE WHEN $2::jsonb ? 'organizationType' THEN 'organizationType' END,
               CASE WHEN $2::jsonb ? 'status' THEN 'status' END,
               CASE WHEN $2::jsonb ? 'website' THEN 'website' END,
               CASE WHEN $2::jsonb ? 'email' THEN 'email' END,
               CASE WHEN $2::jsonb ? 'phone' THEN 'phone' END,
               CASE WHEN ($2::jsonb ? 'taxCountry' OR $2::jsonb ? 'taxNumber') THEN 'taxIdentity' END
             ]::text[],NULL),
             jsonb_build_object(
               'organizationType',organization_type,
               'status',status,
               'verificationStatus',verification_status,
               'hasTaxIdentity',(tax_country IS NOT NULL AND tax_number IS NOT NULL)
             )
           FROM organization
         )
         SELECT
           id,slug,legal_name AS "legalName",display_name AS "displayName",
           organization_type AS "organizationType",status,
           verification_status AS "verificationStatus",
           website,email,phone,tax_country AS "taxCountry",tax_number AS "taxNumber",
           created_at AS "createdAt",updated_at AS "updatedAt"
         FROM organization`,
        id,
        payload,
        actorUserId,
      );

      if (!rows.length) {
        throw new NotFoundException('Supplier organization not found');
      }

      return rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.rethrowMutationError(error);
    }
  }

  private rethrowMutationError(error: unknown): never {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as { code?: unknown; meta?: { code?: unknown } })
        : {};
    const code = String(candidate.code ?? '');
    const metaCode = String(candidate.meta?.code ?? '');

    if (code === '23505' || code === 'P2002' || metaCode === '23505') {
      throw new ConflictException('Supplier organization identity already exists');
    }

    throw error;
  }
}
