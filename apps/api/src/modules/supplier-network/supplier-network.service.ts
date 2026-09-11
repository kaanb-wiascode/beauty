import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

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
  organizationType?: SupplierOrganizationType;
  website?: string;
  email?: string;
  phone?: string;
  taxCountry?: string;
  taxNumber?: string;
}

export interface ConnectInventorySupplierInput {
  supplierOrganizationId: string;
  inventorySupplierId: string;
}

@Injectable()
export class SupplierNetworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private normalizeSlug(value: string) {
    return value
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async createOrganization(input: CreateSupplierOrganizationInput) {
    const slug = this.normalizeSlug(input.slug);
    const legalName = input.legalName.trim();
    const displayName = input.displayName.trim();

    if (!slug || !legalName || !displayName) {
      throw new BadRequestException(
        'Supplier slug, legal name and display name are required.',
      );
    }

    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id
       FROM supplier_organizations
       WHERE slug=$1
          OR ($2::text IS NOT NULL AND $3::text IS NOT NULL
              AND tax_country=$2 AND tax_number=$3)
       LIMIT 1`,
      slug,
      input.taxCountry?.trim().toUpperCase() || null,
      input.taxNumber?.trim() || null,
    );

    if (existing.length) {
      throw new BadRequestException(
        'A supplier organization with the same slug or tax identity already exists.',
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO supplier_organizations(
         slug,legal_name,display_name,organization_type,
         website,email,phone,tax_country,tax_number
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING
         id,slug,legal_name AS "legalName",display_name AS "displayName",
         organization_type AS "organizationType",status,
         verification_status AS "verificationStatus",
         website,email,phone,tax_country AS "taxCountry",tax_number AS "taxNumber",
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      slug,
      legalName,
      displayName,
      input.organizationType ?? 'OTHER',
      input.website?.trim() || null,
      input.email?.trim().toLowerCase() || null,
      input.phone?.trim() || null,
      input.taxCountry?.trim().toUpperCase() || null,
      input.taxNumber?.trim() || null,
    );

    return rows[0];
  }

  async findOrganizationById(id: string) {
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

  async connectInventorySupplier(input: ConnectInventorySupplierInput) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();

    const [organization, privateSupplier] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,status FROM supplier_organizations WHERE id=$1 LIMIT 1`,
        input.supplierOrganizationId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,tenant_id AS "tenantId",company_id AS "companyId",status
         FROM inventory_suppliers
         WHERE id=$1 AND tenant_id=$2 AND company_id=$3
         LIMIT 1`,
        input.inventorySupplierId,
        tenantId,
        companyId,
      ),
    ]);

    if (!organization.length || organization[0].status === 'ARCHIVED') {
      throw new NotFoundException('Supplier organization not found');
    }

    if (!privateSupplier.length) {
      throw new NotFoundException('Inventory supplier not found in company scope');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO supplier_connections(
         supplier_organization_id,tenant_id,company_id,inventory_supplier_id
       ) VALUES($1,$2,$3,$4)
       ON CONFLICT (inventory_supplier_id)
       DO UPDATE SET
         supplier_organization_id=EXCLUDED.supplier_organization_id,
         status='ACTIVE',
         updated_at=NOW()
       RETURNING
         id,supplier_organization_id AS "supplierOrganizationId",
         tenant_id AS "tenantId",company_id AS "companyId",
         inventory_supplier_id AS "inventorySupplierId",status,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      input.supplierOrganizationId,
      tenantId,
      companyId,
      input.inventorySupplierId,
    );

    return rows[0];
  }
}
