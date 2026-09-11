import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

interface PlatformSupplierListInput {
  status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  limit?: number;
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
}
