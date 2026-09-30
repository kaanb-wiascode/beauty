import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PayrollLegalEngineService } from './payroll-legal-engine.service';

@Injectable()
export class PayrollCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
    private readonly legalEngine: PayrollLegalEngineService,
  ) {}

  private async context() {
    const tenantId = this.tenant.getTenantId();
    const companyId = this.tenant.getCompanyId();
    const scope = await this.organizationScope.getBranchScopedWhere();
    const branchIds =
      'branchId' in scope
        ? typeof scope.branchId === 'string'
          ? [scope.branchId]
          : scope.branchId.in
        : null;
    return { tenantId, companyId, branchIds };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private policyAdjustment(baseNetInput: number, work: any, policy: any) {
    const baseNet = this.round(Math.max(0, Number(baseNetInput) || 0));
    if (!policy?.enabled) {
      return {
        policyApplied: false,
        baseNet,
        overtimeNetAddition: 0,
        unpaidLeaveNetDeduction: 0,
        targetNet: baseNet,
      };
    }

    let overtimeNetAddition = 0;
    let unpaidLeaveNetDeduction = 0;

    if (policy.applyOvertime) {
      const standard = Number(policy.standardMonthlyMinutes);
      const multiplier = Number(policy.overtimeMultiplier);
      if (!Number.isFinite(standard) || standard <= 0 || !Number.isFinite(multiplier) || multiplier < 0) {
        throw new BadRequestException('Fazla mesai politikası için standart aylık dakika ve katsayı geçerli olmalıdır.');
      }
      overtimeNetAddition = this.round(
        (baseNet / standard) * Math.max(0, Number(work?.approvedOvertimeMinutes) || 0) * multiplier,
      );
    }

    if (policy.applyUnpaidLeaveDeduction) {
      const divisor = Number(policy.monthlyDayDivisor);
      if (!Number.isFinite(divisor) || divisor <= 0) {
        throw new BadRequestException('Ücretsiz izin kesintisi için aylık gün böleni geçerli olmalıdır.');
      }
      unpaidLeaveNetDeduction = this.round(
        (baseNet / divisor) * Math.max(0, Number(work?.unpaidLeaveDays) || 0),
      );
    }

    return {
      policyApplied: true,
      baseNet,
      overtimeNetAddition,
      unpaidLeaveNetDeduction,
      targetNet: this.round(Math.max(0, baseNet + overtimeNetAddition - unpaidLeaveNetDeduction)),
    };
  }

  async openingBalances(taxYear?: number) {
    const { tenantId, companyId, branchIds } = await this.context();
    const year = taxYear == null ? null : Number(taxYear);
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2200)) {
      throw new BadRequestException('Geçerli bir vergi yılı gereklidir.');
    }
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.staff_id AS "staffId",s."firstName",s."lastName",b.branch_id AS "branchId",
              b.tax_year AS "taxYear",b.cumulative_tax_base AS "cumulativeTaxBase",
              b.source_reference AS "sourceReference",b.note,b.recorded_at AS "recordedAt",b.updated_at AS "updatedAt"
       FROM payroll_tax_base_opening_balances b
       JOIN staff s ON s.id=b.staff_id
       WHERE b.tenant_id=$1::text AND b.company_id=$2::text
         AND ($3::text[] IS NULL OR b.branch_id=ANY($3::text[]))
         AND ($4::int IS NULL OR b.tax_year=$4)
       ORDER BY b.tax_year DESC,s."firstName",s."lastName"`,
      tenantId,
      companyId,
      branchIds,
      year,
    );
  }

  async upsertOpeningBalance(staffId: string, input: any, userId: string) {
    const { tenantId, companyId, branchIds } = await this.context();
    const taxYear = Number(input?.taxYear);
    const cumulativeTaxBase = this.round(Number(input?.cumulativeTaxBase));
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) {
      throw new BadRequestException('Geçerli bir vergi yılı gereklidir.');
    }
    if (!Number.isFinite(cumulativeTaxBase) || cumulativeTaxBase < 0) {
      throw new BadRequestException('Kümülatif vergi matrahı sıfır veya daha büyük olmalıdır.');
    }

    return this.prisma.$transaction(async (tx) => {
      const staff = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id,s."branchId" AS "branchId"
         FROM staff s JOIN branches br ON br.id=s."branchId"
         WHERE s.id=$1::text AND s."tenantId"=$2::text AND br."companyId"=$3::text
           AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[]))
         LIMIT 1`,
        staffId,
        tenantId,
        companyId,
        branchIds,
      );
      if (!staff.length) throw new NotFoundException('Personel bulunamadı.');

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO payroll_tax_base_opening_balances(
           tenant_id,company_id,branch_id,staff_id,tax_year,cumulative_tax_base,
           source_reference,note,recorded_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9::text)
         ON CONFLICT(tenant_id,company_id,staff_id,tax_year)
         DO UPDATE SET branch_id=EXCLUDED.branch_id,cumulative_tax_base=EXCLUDED.cumulative_tax_base,
                       source_reference=EXCLUDED.source_reference,note=EXCLUDED.note,
                       recorded_by_user_id=EXCLUDED.recorded_by_user_id,updated_at=NOW()
         RETURNING id,staff_id AS "staffId",branch_id AS "branchId",tax_year AS "taxYear",
                   cumulative_tax_base AS "cumulativeTaxBase",source_reference AS "sourceReference",
                   note,recorded_at AS "recordedAt",updated_at AS "updatedAt"`,
        tenantId,
        companyId,
        staff[0].branchId,
        staffId,
        taxYear,
        cumulativeTaxBase,
        input?.sourceReference ? String(input.sourceReference).trim() : null,
        input?.note ? String(input.note).trim() : null,
        userId,
      );
      return rows[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async prepare(periodId: string) {
    const { tenantId, companyId, branchIds } = await this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const periods = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,year,month,status,branch_id AS "branchId"
           FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT'
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!periods.length) throw new BadRequestException('Taslak bordro dönemi bulunamadı.');
        const period = periods[0];
        if (!period.branchId) throw new BadRequestException('Otomatik bordro için şubeye bağlı dönem gereklidir.');

        const closures = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,period_start AS "periodStart",period_end AS "periodEnd",snapshot,closed_at AS "closedAt"
           FROM hr_attendance_period_closures
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
             AND payroll_period_id=$4::text AND year=$5 AND month=$6 AND status='CLOSED'
           LIMIT 1`,
          tenantId,
          companyId,
          period.branchId,
          periodId,
          Number(period.year),
          Number(period.month),
        );
        if (!closures.length) {
          throw new BadRequestException('Otomatik bordro hesabı için önce puantaj kapanışı tamamlanmalıdır.');
        }
        const closure = closures[0];
        const closureSnapshot =
          closure.snapshot && typeof closure.snapshot === 'object' ? closure.snapshot : {};
        const staffRows = Array.isArray(closureSnapshot.staff) ? closureSnapshot.staff : [];

        const versions = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,version_label AS "versionLabel",parameters,effective_from AS "effectiveFrom",
                  effective_to AS "effectiveTo",source_reference AS "sourceReference"
           FROM payroll_legal_parameter_versions
           WHERE tenant_id=$1::text AND company_id=$2::text AND jurisdiction='TR' AND status='PUBLISHED'
             AND effective_from <= $3::date AND (effective_to IS NULL OR effective_to >= $3::date)
           ORDER BY effective_from DESC LIMIT 1`,
          tenantId,
          companyId,
          closure.periodEnd,
        );
        if (!versions.length) {
          return {
            periodId,
            status: 'BLOCKED',
            blockers: [{ code: 'MISSING_LEGAL_PARAMETER_VERSION', message: 'Dönem sonunu kapsayan yayınlı yasal bordro parametre versiyonu bulunmuyor.' }],
          };
        }
        const version = versions[0];

        const policyRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT enabled,apply_overtime AS "applyOvertime",
                  apply_unpaid_leave_deduction AS "applyUnpaidLeaveDeduction",
                  standard_monthly_minutes AS "standardMonthlyMinutes",
                  overtime_multiplier AS "overtimeMultiplier",
                  monthly_day_divisor AS "monthlyDayDivisor"
           FROM payroll_policy_settings
           WHERE tenant_id=$1::text AND company_id=$2::text LIMIT 1`,
          tenantId,
          companyId,
        );
        const policy = policyRows[0] ?? {
          enabled: false,
          applyOvertime: false,
          applyUnpaidLeaveDeduction: false,
          standardMonthlyMinutes: null,
          overtimeMultiplier: null,
          monthlyDayDivisor: null,
        };

        const contracts = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,staff_id AS "staffId",salary_basis AS "salaryBasis",net_amount AS "netAmount",
                  currency,effective_from AS "effectiveFrom",effective_to AS "effectiveTo"
           FROM hr_salary_contracts
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND status='ACTIVE'
             AND effective_from <= $4::date AND (effective_to IS NULL OR effective_to >= $4::date)
           ORDER BY staff_id,effective_from DESC`,
          tenantId,
          companyId,
          period.branchId,
          closure.periodEnd,
        );
        const contractByStaff = new Map<string, any>();
        const duplicateContractStaff = new Set<string>();
        for (const contract of contracts) {
          const key = String(contract.staffId);
          if (contractByStaff.has(key)) duplicateContractStaff.add(key);
          else contractByStaff.set(key, contract);
        }

        const openingRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT staff_id AS "staffId",cumulative_tax_base AS "cumulativeTaxBase"
           FROM payroll_tax_base_opening_balances
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND tax_year=$4`,
          tenantId,
          companyId,
          period.branchId,
          Number(period.year),
        );
        const openingByStaff = new Map<string, number>(
          openingRows.map((row: any) => [String(row.staffId), Number(row.cumulativeTaxBase ?? 0)]),
        );

        const priorRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT pi.staff_id AS "staffId",
                  COUNT(*)::int AS "priorCount",
                  COALESCE(SUM(NULLIF(pi.calculation_snapshot->'legalCalculation'->>'taxableBase','')::numeric),0) AS "priorTaxableBase"
           FROM payroll_items pi
           JOIN payroll_periods pp ON pp.id=pi.period_id
           WHERE pi.tenant_id=$1::text AND pi.company_id=$2::text AND pi.branch_id=$3::text
             AND pp.tenant_id=$1::text AND pp.company_id=$2::text
             AND pp.year=$4 AND pp.month<$5 AND pp.status='POSTED'
             AND pi.calculation_snapshot ? 'legalCalculation'
             AND pi.calculation_snapshot->'legalCalculation'->>'source'='NET_CONTRACT_LEGAL_ENGINE'
           GROUP BY pi.staff_id`,
          tenantId,
          companyId,
          period.branchId,
          Number(period.year),
          Number(period.month),
        );
        const priorByStaff = new Map<string, { priorCount: number; priorTaxableBase: number }>(
          priorRows.map((row: any) => [
            String(row.staffId),
            {
              priorCount: Number(row.priorCount ?? 0),
              priorTaxableBase: Number(row.priorTaxableBase ?? 0),
            },
          ]),
        );

        const blockers: any[] = [];
        const calculations: any[] = [];

        for (const work of staffRows) {
          const staffId = String(work?.staffId ?? '');
          const name = [work?.firstName, work?.lastName].filter(Boolean).join(' ').trim();
          if (!staffId) continue;

          if (duplicateContractStaff.has(staffId)) {
            blockers.push({
              code: 'OVERLAPPING_SALARY_CONTRACTS',
              staffId,
              name,
              message: 'Personelin dönem tarihinde birden fazla aktif ücret sözleşmesi bulunuyor.',
            });
            continue;
          }

          const contract = contractByStaff.get(staffId);
          if (!contract) {
            blockers.push({
              code: 'MISSING_NET_SALARY_CONTRACT',
              staffId,
              name,
              message: 'Personelin dönem sonunu kapsayan aktif NET ücret sözleşmesi bulunmuyor.',
            });
            continue;
          }
          if (contract.salaryBasis !== 'MONTHLY_NET') {
            blockers.push({
              code: 'UNSUPPORTED_SALARY_BASIS',
              staffId,
              name,
              salaryBasis: contract.salaryBasis,
              message: 'Otomatik bordro hazırlama şu aşamada aylık NET ücret sözleşmesini destekliyor.',
            });
            continue;
          }
          if (String(contract.currency).toUpperCase() !== 'TRY') {
            blockers.push({
              code: 'UNSUPPORTED_CURRENCY',
              staffId,
              name,
              currency: contract.currency,
              message: 'Yasal bordro motoru şu aşamada TRY sözleşmelerini destekliyor.',
            });
            continue;
          }

          const prior = priorByStaff.get(staffId);
          const hasOpening = openingByStaff.has(staffId);
          if (Number(period.month) > 1 && !hasOpening && !prior?.priorCount) {
            blockers.push({
              code: 'MISSING_CUMULATIVE_TAX_BASE',
              staffId,
              name,
              taxYear: Number(period.year),
              message: 'Yıl ortası bordro hesabı için kümülatif vergi matrahı açılış kaydı veya önceki kesinleşmiş bordro zinciri bulunmuyor.',
            });
            continue;
          }

          const cumulativeTaxBaseBefore = this.round(
            Number(openingByStaff.get(staffId) ?? 0) + Number(prior?.priorTaxableBase ?? 0),
          );
          const netAdjustment = this.policyAdjustment(Number(contract.netAmount), work, policy);
          const legal = this.legalEngine.calculateWithParameters({
            targetNet: netAdjustment.targetNet,
            parameters: version.parameters,
            cumulativeTaxBaseBefore,
            otherDeductions: 0,
          });

          calculations.push({
            staffId,
            name,
            contract,
            work,
            netAdjustment,
            legal,
            cumulativeTaxBaseBefore,
          });
        }

        if (blockers.length) {
          return {
            periodId,
            status: 'BLOCKED',
            closureId: closure.id,
            staffCount: staffRows.length,
            readyCount: calculations.length,
            blockerCount: blockers.length,
            blockers,
          };
        }

        for (const calc of calculations) {
          const snapshot = {
            grossAmount: calc.legal.grossAmount,
            netAmount: calc.legal.netAmount,
            employerCost: calc.legal.employerCost,
            salaryContract: {
              id: calc.contract.id,
              salaryBasis: calc.contract.salaryBasis,
              netAmount: Number(calc.contract.netAmount),
              currency: calc.contract.currency,
              effectiveFrom: calc.contract.effectiveFrom,
              effectiveTo: calc.contract.effectiveTo,
            },
            workInputs: {
              source: 'ATTENDANCE_PERIOD_CLOSE',
              closureId: closure.id,
              closedAt: closure.closedAt,
              periodStart: closure.periodStart,
              periodEnd: closure.periodEnd,
              workedMinutes: Number(calc.work?.workedMinutes ?? 0),
              overtimeMinutes: Number(calc.work?.overtimeMinutes ?? 0),
              approvedOvertimeMinutes: Number(calc.work?.approvedOvertimeMinutes ?? 0),
              presentDays: Number(calc.work?.presentDays ?? 0),
              absentDays: Number(calc.work?.absentDays ?? 0),
              approvedLeaveRecords: Number(calc.work?.approvedLeaveRecords ?? 0),
              declaredLeaveDays: Number(calc.work?.declaredLeaveDays ?? 0),
              unpaidLeaveRecords: Number(calc.work?.unpaidLeaveRecords ?? 0),
              unpaidLeaveDays: Number(calc.work?.unpaidLeaveDays ?? 0),
            },
            netCompensationAdjustment: {
              source: 'NET_CONTRACT_POLICY',
              settings: policy,
              ...calc.netAdjustment,
            },
            legalCalculation: {
              source: 'NET_CONTRACT_LEGAL_ENGINE',
              parameterVersionId: version.id,
              parameterVersionLabel: version.versionLabel,
              parameterEffectiveFrom: version.effectiveFrom,
              parameterEffectiveTo: version.effectiveTo,
              parameterSourceReference: version.sourceReference,
              cumulativeTaxBaseBefore: calc.cumulativeTaxBaseBefore,
              ...calc.legal,
            },
          };

          await tx.$executeRawUnsafe(
            `INSERT INTO payroll_items(
               tenant_id,company_id,branch_id,period_id,staff_id,
               gross_amount,net_amount,deductions,employer_cost,
               income_tax,stamp_tax,employee_social_security,unemployment_employee,
               employer_social_security,unemployment_employer,other_deductions,
               calculation_snapshot,status,updated_at
             ) VALUES(
               $1::text,$2::text,$3::text,$4::text,$5::text,
               $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,'DRAFT',NOW()
             )
             ON CONFLICT(period_id,staff_id) DO UPDATE SET
               company_id=EXCLUDED.company_id,
               branch_id=EXCLUDED.branch_id,
               gross_amount=EXCLUDED.gross_amount,
               net_amount=EXCLUDED.net_amount,
               deductions=EXCLUDED.deductions,
               employer_cost=EXCLUDED.employer_cost,
               income_tax=EXCLUDED.income_tax,
               stamp_tax=EXCLUDED.stamp_tax,
               employee_social_security=EXCLUDED.employee_social_security,
               unemployment_employee=EXCLUDED.unemployment_employee,
               employer_social_security=EXCLUDED.employer_social_security,
               unemployment_employer=EXCLUDED.unemployment_employer,
               other_deductions=EXCLUDED.other_deductions,
               calculation_snapshot=EXCLUDED.calculation_snapshot,
               status='DRAFT',
               updated_at=NOW()`,
            tenantId,
            companyId,
            period.branchId,
            periodId,
            calc.staffId,
            calc.legal.grossAmount,
            calc.legal.netAmount,
            calc.legal.deductions,
            calc.legal.employerCost,
            calc.legal.incomeTax,
            calc.legal.stampTax,
            calc.legal.employeeSocialSecurity,
            calc.legal.unemploymentEmployee,
            calc.legal.employerSocialSecurity,
            calc.legal.unemploymentEmployer,
            calc.legal.otherDeductions,
            JSON.stringify(snapshot),
          );
        }

        const totals = calculations.reduce(
          (acc, calc) => ({
            grossAmount: this.round(acc.grossAmount + Number(calc.legal.grossAmount)),
            netAmount: this.round(acc.netAmount + Number(calc.legal.netAmount)),
            deductions: this.round(acc.deductions + Number(calc.legal.deductions)),
            employerCost: this.round(acc.employerCost + Number(calc.legal.employerCost)),
          }),
          { grossAmount: 0, netAmount: 0, deductions: 0, employerCost: 0 },
        );

        return {
          periodId,
          status: 'PREPARED',
          closureId: closure.id,
          legalParameterVersionId: version.id,
          legalParameterVersionLabel: version.versionLabel,
          staffCount: staffRows.length,
          preparedCount: calculations.length,
          totals,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
