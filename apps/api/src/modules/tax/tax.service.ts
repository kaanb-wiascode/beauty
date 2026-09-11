import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type TaxSettings = {
  salesVatRate: number;
  purchaseVatRate: number;
  pricesIncludeVat: boolean;
};

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async getSettings(): Promise<TaxSettings> {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sales_vat_rate AS "salesVatRate",purchase_vat_rate AS "purchaseVatRate",
              prices_include_vat AS "pricesIncludeVat"
       FROM company_tax_settings
       WHERE tenant_id=$1::text AND company_id=$2::text
       LIMIT 1`,
      tenantId,
      companyId,
    );
    if (!rows.length) return { salesVatRate: 0, purchaseVatRate: 0, pricesIncludeVat: true };
    return {
      salesVatRate: Number(rows[0].salesVatRate ?? 0),
      purchaseVatRate: Number(rows[0].purchaseVatRate ?? 0),
      pricesIncludeVat: Boolean(rows[0].pricesIncludeVat),
    };
  }

  async updateSettings(input: TaxSettings) {
    for (const rate of [input.salesVatRate, input.purchaseVatRate]) {
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new BadRequestException('VAT rates must be between 0 and 100.');
      }
    }
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO company_tax_settings(company_id,tenant_id,sales_vat_rate,purchase_vat_rate,prices_include_vat)
       VALUES($1::text,$2::text,$3,$4,$5)
       ON CONFLICT(company_id)
       DO UPDATE SET sales_vat_rate=EXCLUDED.sales_vat_rate,
                     purchase_vat_rate=EXCLUDED.purchase_vat_rate,
                     prices_include_vat=EXCLUDED.prices_include_vat,
                     updated_at=NOW()
       WHERE company_tax_settings.tenant_id=$2::text`,
      companyId,
      tenantId,
      this.round(input.salesVatRate),
      this.round(input.purchaseVatRate),
      input.pricesIncludeVat,
    );
    return this.getSettings();
  }

  calculate(grossOrNetAmount: number, rate: number, pricesIncludeVat: boolean) {
    const amount = this.round(grossOrNetAmount);
    const normalizedRate = this.round(rate);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('Tax amount base cannot be negative.');
    if (!Number.isFinite(normalizedRate) || normalizedRate < 0 || normalizedRate > 100) {
      throw new BadRequestException('VAT rate must be between 0 and 100.');
    }
    if (normalizedRate === 0) return { net: amount, vat: 0, gross: amount, rate: 0 };
    if (pricesIncludeVat) {
      const net = this.round(amount / (1 + normalizedRate / 100));
      const vat = this.round(amount - net);
      return { net, vat, gross: amount, rate: normalizedRate };
    }
    const vat = this.round(amount * normalizedRate / 100);
    return { net: amount, vat, gross: this.round(amount + vat), rate: normalizedRate };
  }

  async taxSummary(from?: Date, to?: Date) {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const branchId = this.tenant.getBranchId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COALESCE((SELECT SUM(vat_total) FROM sales s
                   JOIN branches b ON b.id=s.branch_id
                   WHERE s.tenant_id=$1::text AND b.company_id=$2::text
                     AND ($3::text IS NULL OR s.branch_id=$3::text)
                     AND s.status='CONFIRMED'
                     AND ($4::timestamptz IS NULL OR s.confirmed_at >= $4::timestamptz)
                     AND ($5::timestamptz IS NULL OR s.confirmed_at <= $5::timestamptz)),0)::numeric AS "outputVat",
         COALESCE((SELECT SUM(vat_total) FROM inventory_goods_receipts gr
                   WHERE gr.tenant_id=$1::text AND gr.company_id=$2::text
                     AND ($3::text IS NULL OR gr.branch_id=$3::text)
                     AND gr.reversed_at IS NULL
                     AND ($4::timestamptz IS NULL OR gr.created_at >= $4::timestamptz)
                     AND ($5::timestamptz IS NULL OR gr.created_at <= $5::timestamptz)),0)::numeric AS "inputVat"`,
      tenantId,
      companyId,
      branchId,
      from ?? null,
      to ?? null,
    );
    const outputVat = Number(rows[0]?.outputVat ?? 0);
    const inputVat = Number(rows[0]?.inputVat ?? 0);
    return {
      outputVat,
      inputVat,
      netVatPayable: this.round(outputVat - inputVat),
      from: from ?? null,
      to: to ?? null,
    };
  }
}
