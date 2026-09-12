import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class ProcurementRfqCommercialTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(rfqId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    const scope = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id
       FROM procurement_rfqs r
       JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
       WHERE r.id=$1::text
         AND r.tenant_id=$2::text
         AND r.company_id=$3::text
         AND ($4::text IS NULL OR w.branch_id=$4::text)
       LIMIT 1`,
      rfqId,
      tenantId,
      companyId,
      branchId,
    );
    if (!scope.length) throw new NotFoundException('RFQ not found');

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sq.id AS "quoteId",
              sq.payment_terms_days AS "paymentTermsDays",
              sq.warranty_months AS "warrantyMonths",
              sq.installation_included AS "installationIncluded",
              sq.training_included AS "trainingIncluded",
              sq.service_sla_days AS "serviceSlaDays",
              sq.financing_available AS "financingAvailable"
       FROM supplier_quotes sq
       WHERE sq.rfq_id=$1::text
       ORDER BY sq.created_at ASC`,
      rfqId,
    );
  }
}
