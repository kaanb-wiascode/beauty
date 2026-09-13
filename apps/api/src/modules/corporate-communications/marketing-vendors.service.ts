import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateMarketingVendorInput,
  UpdateMarketingVendorInput,
} from './marketing-vendors.schemas';

type VendorRow = {
  id: string;
  branchId: string | null;
  [key: string]: unknown;
};

@Injectable()
export class MarketingVendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  private async assertBranch(branchId: string) {
    const { companyId } = this.context();
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Vendor branch is outside the active company.');
    }
  }

  async list(filters: {
    status?: string;
    vendorType?: string;
    search?: string;
    limit: number;
  }) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<VendorRow[]>(
      `SELECT v.id,v.branch_id AS "branchId",v.name,v.vendor_type AS "vendorType",v.status,
              v.contact_name AS "contactName",v.contact_email AS "contactEmail",v.contact_phone AS "contactPhone",
              v.contract_starts_at AS "contractStartsAt",v.contract_ends_at AS "contractEndsAt",
              v.service_scope AS "serviceScope",v.monthly_fee AS "monthlyFee",v.currency,
              v.payment_model AS "paymentModel",v.kpi_commitments AS "kpiCommitments",
              v.performance_notes AS "performanceNotes",v.attributed_revenue AS "attributedRevenue",
              v.metadata,v.created_at AS "createdAt",v.updated_at AS "updatedAt"
       FROM corporate_marketing_vendors v
       WHERE v.tenant_id=$1::text AND v.company_id=$2::text
         AND ($3::text IS NULL OR v.branch_id IS NULL OR v.branch_id=$3::text)
         AND ($4::text IS NULL OR v.status=$4::text)
         AND ($5::text IS NULL OR v.vendor_type=$5::text)
         AND ($6::text IS NULL OR v.name ILIKE '%' || $6 || '%' OR COALESCE(v.contact_name,'') ILIKE '%' || $6 || '%')
       ORDER BY CASE WHEN v.status='ACTIVE' THEN 0 ELSE 1 END,v.updated_at DESC,v.id
       LIMIT $7`,
      tenantId,
      companyId,
      branchId,
      filters.status ?? null,
      filters.vendorType ?? null,
      filters.search?.trim() || null,
      filters.limit,
    );
  }

  async create(input: CreateMarketingVendorInput, actorUserId: string) {
    const context = this.context();
    const branchId = input.branchId === undefined ? context.branchId : input.branchId;

    if (branchId) await this.assertBranch(branchId);
    if (context.branchId && branchId && branchId !== context.branchId) {
      throw new BadRequestException('Vendor cannot be created outside the active branch.');
    }

    const rows = await this.prisma.$queryRawUnsafe<VendorRow[]>(
      `INSERT INTO corporate_marketing_vendors(
         tenant_id,company_id,branch_id,name,vendor_type,status,contact_name,contact_email,contact_phone,
         contract_starts_at,contract_ends_at,service_scope,monthly_fee,currency,payment_model,
         kpi_commitments,performance_notes,metadata,created_by_user_id
       ) VALUES(
         $1::text,$2::text,$3::text,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15,
         $16::jsonb,$17,$18::jsonb,$19::text
       )
       RETURNING id,branch_id AS "branchId",name,vendor_type AS "vendorType",status,
                 contact_name AS "contactName",contact_email AS "contactEmail",contact_phone AS "contactPhone",
                 contract_starts_at AS "contractStartsAt",contract_ends_at AS "contractEndsAt",
                 service_scope AS "serviceScope",monthly_fee AS "monthlyFee",currency,
                 payment_model AS "paymentModel",kpi_commitments AS "kpiCommitments",
                 performance_notes AS "performanceNotes",attributed_revenue AS "attributedRevenue",
                 metadata,created_at AS "createdAt",updated_at AS "updatedAt"`,
      context.tenantId,
      context.companyId,
      branchId ?? null,
      input.name,
      input.vendorType,
      input.status,
      input.contactName ?? null,
      input.contactEmail ?? null,
      input.contactPhone ?? null,
      input.contractStartsAt ?? null,
      input.contractEndsAt ?? null,
      input.serviceScope ?? null,
      input.monthlyFee,
      input.currency,
      input.paymentModel,
      JSON.stringify(input.kpiCommitments),
      input.performanceNotes ?? null,
      JSON.stringify(input.metadata),
      actorUserId,
    );
    return rows[0];
  }

  async update(id: string, input: UpdateMarketingVendorInput) {
    const context = this.context();
    const existing = await this.findScoped(id);
    const nextBranchId = input.branchId === undefined ? existing.branchId : input.branchId;

    if (nextBranchId) await this.assertBranch(nextBranchId);
    if (context.branchId && nextBranchId && nextBranchId !== context.branchId) {
      throw new BadRequestException('Vendor cannot be moved outside the active branch.');
    }

    const rows = await this.prisma.$queryRawUnsafe<VendorRow[]>(
      `UPDATE corporate_marketing_vendors SET
         branch_id=CASE WHEN $5::boolean THEN $6::text ELSE branch_id END,
         name=COALESCE($7,name),vendor_type=COALESCE($8,vendor_type),status=COALESCE($9,status),
         contact_name=CASE WHEN $10::boolean THEN $11 ELSE contact_name END,
         contact_email=CASE WHEN $12::boolean THEN $13 ELSE contact_email END,
         contact_phone=CASE WHEN $14::boolean THEN $15 ELSE contact_phone END,
         contract_starts_at=CASE WHEN $16::boolean THEN $17::date ELSE contract_starts_at END,
         contract_ends_at=CASE WHEN $18::boolean THEN $19::date ELSE contract_ends_at END,
         service_scope=CASE WHEN $20::boolean THEN $21 ELSE service_scope END,
         monthly_fee=COALESCE($22,monthly_fee),currency=COALESCE($23,currency),payment_model=COALESCE($24,payment_model),
         kpi_commitments=CASE WHEN $25::boolean THEN $26::jsonb ELSE kpi_commitments END,
         performance_notes=CASE WHEN $27::boolean THEN $28 ELSE performance_notes END,
         metadata=CASE WHEN $29::boolean THEN $30::jsonb ELSE metadata END,updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
       RETURNING id,branch_id AS "branchId",name,vendor_type AS "vendorType",status,
                 contact_name AS "contactName",contact_email AS "contactEmail",contact_phone AS "contactPhone",
                 contract_starts_at AS "contractStartsAt",contract_ends_at AS "contractEndsAt",
                 service_scope AS "serviceScope",monthly_fee AS "monthlyFee",currency,
                 payment_model AS "paymentModel",kpi_commitments AS "kpiCommitments",
                 performance_notes AS "performanceNotes",attributed_revenue AS "attributedRevenue",
                 metadata,created_at AS "createdAt",updated_at AS "updatedAt"`,
      id,
      context.tenantId,
      context.companyId,
      context.branchId,
      input.branchId !== undefined,
      nextBranchId ?? null,
      input.name ?? null,
      input.vendorType ?? null,
      input.status ?? null,
      input.contactName !== undefined,
      input.contactName ?? null,
      input.contactEmail !== undefined,
      input.contactEmail ?? null,
      input.contactPhone !== undefined,
      input.contactPhone ?? null,
      input.contractStartsAt !== undefined,
      input.contractStartsAt ?? null,
      input.contractEndsAt !== undefined,
      input.contractEndsAt ?? null,
      input.serviceScope !== undefined,
      input.serviceScope ?? null,
      input.monthlyFee ?? null,
      input.currency ?? null,
      input.paymentModel ?? null,
      input.kpiCommitments !== undefined,
      JSON.stringify(input.kpiCommitments ?? {}),
      input.performanceNotes !== undefined,
      input.performanceNotes ?? null,
      input.metadata !== undefined,
      JSON.stringify(input.metadata ?? {}),
    );

    if (!rows.length) throw new NotFoundException('Marketing vendor not found.');
    return rows[0];
  }

  private async findScoped(id: string): Promise<VendorRow> {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<VendorRow[]>(
      `SELECT id,branch_id AS "branchId" FROM corporate_marketing_vendors
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('Marketing vendor not found.');
    return rows[0];
  }
}
