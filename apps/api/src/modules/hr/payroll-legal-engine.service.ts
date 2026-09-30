import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type TaxBracket = { upTo: number | null; rate: number };
type LegalParameters = {
  employeeSocialSecurityRate: number;
  unemploymentEmployeeRate: number;
  employerSocialSecurityRate: number;
  unemploymentEmployerRate: number;
  stampTaxRate: number;
  incomeTaxBrackets: TaxBracket[];
  minimumWageIncomeTaxExemption?: number;
  minimumWageStampTaxExemption?: number;
  socialSecurityBaseFloor?: number | null;
  socialSecurityBaseCeiling?: number | null;
};

@Injectable()
export class PayrollLegalEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private rate(value: unknown, field: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new BadRequestException(`${field} must be between 0 and 1.`);
    }
    return n;
  }

  private amount(value: unknown, field: string, nullable = false) {
    if (nullable && (value === null || value === undefined || value === '')) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException(`${field} must be a non-negative number.`);
    }
    return n;
  }

  private validateParameters(input: any): LegalParameters {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Legal payroll parameters must be an object.');
    }
    const rawBrackets = Array.isArray(input.incomeTaxBrackets) ? input.incomeTaxBrackets : [];
    if (!rawBrackets.length) throw new BadRequestException('At least one income tax bracket is required.');

    let previous = 0;
    const brackets: TaxBracket[] = rawBrackets.map((row: any, index: number) => {
      const upTo = row?.upTo == null ? null : this.amount(row.upTo, `incomeTaxBrackets[${index}].upTo`);
      const rate = this.rate(row?.rate, `incomeTaxBrackets[${index}].rate`);
      if (upTo !== null && upTo <= previous) {
        throw new BadRequestException('Income tax bracket upper limits must be strictly increasing.');
      }
      if (index < rawBrackets.length - 1 && upTo === null) {
        throw new BadRequestException('Only the final income tax bracket can be open ended.');
      }
      if (upTo !== null) previous = upTo;
      return { upTo, rate };
    });
    if (brackets.at(-1)?.upTo !== null) {
      throw new BadRequestException('The final income tax bracket must be open ended.');
    }

    const floor = this.amount(input.socialSecurityBaseFloor, 'socialSecurityBaseFloor', true);
    const ceiling = this.amount(input.socialSecurityBaseCeiling, 'socialSecurityBaseCeiling', true);
    if (floor !== null && ceiling !== null && ceiling < floor) {
      throw new BadRequestException('Social security base ceiling cannot be lower than floor.');
    }

    return {
      employeeSocialSecurityRate: this.rate(input.employeeSocialSecurityRate, 'employeeSocialSecurityRate'),
      unemploymentEmployeeRate: this.rate(input.unemploymentEmployeeRate, 'unemploymentEmployeeRate'),
      employerSocialSecurityRate: this.rate(input.employerSocialSecurityRate, 'employerSocialSecurityRate'),
      unemploymentEmployerRate: this.rate(input.unemploymentEmployerRate, 'unemploymentEmployerRate'),
      stampTaxRate: this.rate(input.stampTaxRate, 'stampTaxRate'),
      incomeTaxBrackets: brackets,
      minimumWageIncomeTaxExemption: this.amount(
        input.minimumWageIncomeTaxExemption ?? 0,
        'minimumWageIncomeTaxExemption',
      ),
      minimumWageStampTaxExemption: this.amount(
        input.minimumWageStampTaxExemption ?? 0,
        'minimumWageStampTaxExemption',
      ),
      socialSecurityBaseFloor: floor,
      socialSecurityBaseCeiling: ceiling,
    };
  }

  private cumulativeIncomeTax(base: number, brackets: TaxBracket[]) {
    let remaining = Math.max(0, base);
    let lower = 0;
    let tax = 0;
    for (const bracket of brackets) {
      const width = bracket.upTo === null ? remaining : Math.max(0, bracket.upTo - lower);
      const taxable = Math.min(remaining, width);
      tax += taxable * bracket.rate;
      remaining -= taxable;
      if (remaining <= 0) break;
      if (bracket.upTo !== null) lower = bracket.upTo;
    }
    return this.round(tax);
  }

  private grossToNet(
    grossInput: number,
    params: LegalParameters,
    cumulativeTaxBaseBeforeInput = 0,
    otherDeductionsInput = 0,
  ) {
    const gross = this.round(Math.max(0, Number(grossInput) || 0));
    const cumulativeTaxBaseBefore = this.round(Math.max(0, Number(cumulativeTaxBaseBeforeInput) || 0));
    const otherDeductions = this.round(Math.max(0, Number(otherDeductionsInput) || 0));

    let socialSecurityBase = gross;
    if (params.socialSecurityBaseFloor != null) {
      socialSecurityBase = Math.max(socialSecurityBase, params.socialSecurityBaseFloor);
    }
    if (params.socialSecurityBaseCeiling != null) {
      socialSecurityBase = Math.min(socialSecurityBase, params.socialSecurityBaseCeiling);
    }

    const employeeSocialSecurity = this.round(socialSecurityBase * params.employeeSocialSecurityRate);
    const unemploymentEmployee = this.round(socialSecurityBase * params.unemploymentEmployeeRate);
    const taxableBase = this.round(Math.max(0, gross - employeeSocialSecurity - unemploymentEmployee));
    const cumulativeTaxBaseAfter = this.round(cumulativeTaxBaseBefore + taxableBase);
    const grossIncomeTax = this.round(
      this.cumulativeIncomeTax(cumulativeTaxBaseAfter, params.incomeTaxBrackets) -
        this.cumulativeIncomeTax(cumulativeTaxBaseBefore, params.incomeTaxBrackets),
    );
    const incomeTax = this.round(
      Math.max(0, grossIncomeTax - Number(params.minimumWageIncomeTaxExemption ?? 0)),
    );
    const grossStampTax = this.round(gross * params.stampTaxRate);
    const stampTax = this.round(
      Math.max(0, grossStampTax - Number(params.minimumWageStampTaxExemption ?? 0)),
    );
    const employerSocialSecurity = this.round(socialSecurityBase * params.employerSocialSecurityRate);
    const unemploymentEmployer = this.round(socialSecurityBase * params.unemploymentEmployerRate);
    const deductions = this.round(
      employeeSocialSecurity + unemploymentEmployee + incomeTax + stampTax + otherDeductions,
    );
    const net = this.round(Math.max(0, gross - deductions));
    const employerCost = this.round(gross + employerSocialSecurity + unemploymentEmployer);

    return {
      grossAmount: gross,
      netAmount: net,
      deductions,
      incomeTax,
      stampTax,
      employeeSocialSecurity,
      unemploymentEmployee,
      employerSocialSecurity,
      unemploymentEmployer,
      otherDeductions,
      employerCost,
      taxableBase,
      cumulativeTaxBaseBefore,
      cumulativeTaxBaseAfter,
      socialSecurityBase: this.round(socialSecurityBase),
    };
  }

  private netToGross(
    targetNetInput: number,
    params: LegalParameters,
    cumulativeTaxBaseBefore = 0,
    otherDeductions = 0,
  ) {
    const targetNet = this.round(this.amount(targetNetInput, 'targetNet'));
    if (targetNet === 0) return this.grossToNet(0, params, cumulativeTaxBaseBefore, otherDeductions);

    let low = targetNet;
    let high = Math.max(1000, targetNet * 2);
    let highResult = this.grossToNet(high, params, cumulativeTaxBaseBefore, otherDeductions);
    for (let i = 0; i < 20 && highResult.netAmount < targetNet; i += 1) {
      high *= 2;
      highResult = this.grossToNet(high, params, cumulativeTaxBaseBefore, otherDeductions);
    }
    if (highResult.netAmount < targetNet) {
      throw new BadRequestException('Net-to-gross calculation could not reach the target net amount.');
    }

    let best = highResult;
    for (let i = 0; i < 80; i += 1) {
      const mid = (low + high) / 2;
      const result = this.grossToNet(mid, params, cumulativeTaxBaseBefore, otherDeductions);
      best = result;
      if (Math.abs(result.netAmount - targetNet) <= 0.01) break;
      if (result.netAmount < targetNet) low = mid;
      else high = mid;
    }

    return {
      ...best,
      targetNetAmount: targetNet,
      netVariance: this.round(best.netAmount - targetNet),
    };
  }

  calculateWithParameters(input: {
    targetNet: number;
    parameters: unknown;
    cumulativeTaxBaseBefore?: number;
    otherDeductions?: number;
  }) {
    const params = this.validateParameters(input.parameters);
    return {
      ...this.netToGross(
        Number(input.targetNet),
        params,
        Number(input.cumulativeTaxBaseBefore ?? 0),
        Number(input.otherDeductions ?? 0),
      ),
      legalParameterSnapshot: params,
    };
  }

  async createVersion(input: any, userId: string) {
    const { tenantId, companyId } = this.context();
    const versionLabel = String(input?.versionLabel ?? '').trim();
    const effectiveFrom = String(input?.effectiveFrom ?? '').trim();
    const effectiveTo = input?.effectiveTo ? String(input.effectiveTo).trim() : null;
    if (!versionLabel || !effectiveFrom || Number.isNaN(Date.parse(effectiveFrom))) {
      throw new BadRequestException('versionLabel and a valid effectiveFrom are required.');
    }
    if (effectiveTo && (Number.isNaN(Date.parse(effectiveTo)) || effectiveTo < effectiveFrom)) {
      throw new BadRequestException('effectiveTo must be on or after effectiveFrom.');
    }
    const parameters = this.validateParameters(input?.parameters);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO payroll_legal_parameter_versions(
         tenant_id,company_id,jurisdiction,version_label,effective_from,effective_to,status,
         parameters,source_reference,note,created_by_user_id
       ) VALUES($1::text,$2::text,$3,$4,$5::date,$6::date,'DRAFT',$7::jsonb,$8,$9,$10::text)
       RETURNING id,jurisdiction,version_label AS "versionLabel",effective_from AS "effectiveFrom",
                 effective_to AS "effectiveTo",status,parameters,source_reference AS "sourceReference",
                 created_at AS "createdAt"`,
      tenantId,
      companyId,
      String(input?.jurisdiction ?? 'TR').trim().toUpperCase(),
      versionLabel,
      effectiveFrom,
      effectiveTo,
      JSON.stringify(parameters),
      input?.sourceReference ? String(input.sourceReference).trim() : null,
      input?.note ? String(input.note).trim() : null,
      userId,
    );
    return rows[0];
  }

  async publishVersion(id: string, userId: string) {
    const { tenantId, companyId } = this.context();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,jurisdiction,version_label AS "versionLabel",effective_from AS "effectiveFrom",
                effective_to AS "effectiveTo",status,parameters
         FROM payroll_legal_parameter_versions
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         FOR UPDATE`,
        id,
        tenantId,
        companyId,
      );
      if (!rows.length) throw new NotFoundException('Payroll legal parameter version not found.');
      const current = rows[0];
      if (current.status === 'PUBLISHED') return { ...current, duplicate: true };
      if (current.status !== 'DRAFT') {
        throw new BadRequestException('Only a draft legal parameter version can be published.');
      }
      this.validateParameters(current.parameters);

      const overlap = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,version_label AS "versionLabel"
         FROM payroll_legal_parameter_versions
         WHERE tenant_id=$1::text AND company_id=$2::text AND jurisdiction=$3
           AND status='PUBLISHED' AND id<>$4::text
           AND effective_from <= COALESCE($6::date,'9999-12-31'::date)
           AND COALESCE(effective_to,'9999-12-31'::date) >= $5::date
         LIMIT 1`,
        tenantId,
        companyId,
        current.jurisdiction,
        id,
        current.effectiveFrom,
        current.effectiveTo,
      );
      if (overlap.length) {
        throw new BadRequestException(
          `Published legal parameter date range overlaps with ${overlap[0].versionLabel}.`,
        );
      }

      const updated = await tx.$queryRawUnsafe<any[]>(
        `UPDATE payroll_legal_parameter_versions
         SET status='PUBLISHED',published_by_user_id=$2::text,published_at=NOW(),updated_at=NOW()
         WHERE id=$1::text
         RETURNING id,jurisdiction,version_label AS "versionLabel",effective_from AS "effectiveFrom",
                   effective_to AS "effectiveTo",status,parameters,published_at AS "publishedAt"`,
        id,
        userId,
      );
      return updated[0];
    });
  }

  async activeVersion(asOf: string) {
    const { tenantId, companyId } = this.context();
    if (!asOf || Number.isNaN(Date.parse(asOf))) throw new BadRequestException('A valid asOf date is required.');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,jurisdiction,version_label AS "versionLabel",effective_from AS "effectiveFrom",
              effective_to AS "effectiveTo",parameters,source_reference AS "sourceReference",published_at AS "publishedAt"
       FROM payroll_legal_parameter_versions
       WHERE tenant_id=$1::text AND company_id=$2::text AND jurisdiction='TR' AND status='PUBLISHED'
         AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date)
       ORDER BY effective_from DESC LIMIT 1`,
      tenantId,
      companyId,
      asOf,
    );
    if (!rows.length) {
      throw new NotFoundException('No published legal payroll parameter version covers the requested date.');
    }
    return rows[0];
  }

  async calculateNetContract(input: {
    targetNet: number;
    asOf: string;
    cumulativeTaxBaseBefore?: number;
    otherDeductions?: number;
  }) {
    const version = await this.activeVersion(input.asOf);
    const params = this.validateParameters(version.parameters);
    const result = this.netToGross(
      Number(input.targetNet),
      params,
      Number(input.cumulativeTaxBaseBefore ?? 0),
      Number(input.otherDeductions ?? 0),
    );
    return {
      parameterVersionId: version.id,
      parameterVersionLabel: version.versionLabel,
      asOf: input.asOf,
      ...result,
      legalParameterSnapshot: params,
    };
  }
}
