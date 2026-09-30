import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class SalaryContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
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

  private validDate(value: unknown, field: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized || Number.isNaN(Date.parse(normalized))) {
      throw new BadRequestException(`${field} must be a valid date.`);
    }
    return normalized.slice(0, 10);
  }

  private amount(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('netAmount must be a non-negative number.');
    }
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  async list(staffId: string) {
    const { tenantId, companyId, branchIds } = await this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id,c.staff_id AS "staffId",c.branch_id AS "branchId",c.salary_basis AS "salaryBasis",
              c.net_amount AS "netAmount",c.currency,c.effective_from AS "effectiveFrom",
              c.effective_to AS "effectiveTo",c.status,c.note,c.created_at AS "createdAt",c.updated_at AS "updatedAt"
       FROM hr_salary_contracts c
       JOIN branches b ON b.id=c.branch_id
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.staff_id=$3::text
         AND b."companyId"=$2::text
         AND ($4::text[] IS NULL OR c.branch_id=ANY($4::text[]))
       ORDER BY c.effective_from DESC,c.created_at DESC`,
      tenantId,
      companyId,
      staffId,
      branchIds,
    );
  }

  async active(staffId: string, asOf: string) {
    const { tenantId, companyId, branchIds } = await this.context();
    const date = this.validDate(asOf, 'asOf');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT c.id,c.staff_id AS "staffId",c.branch_id AS "branchId",c.salary_basis AS "salaryBasis",
              c.net_amount AS "netAmount",c.currency,c.effective_from AS "effectiveFrom",
              c.effective_to AS "effectiveTo",c.status,c.note
       FROM hr_salary_contracts c
       JOIN branches b ON b.id=c.branch_id
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text AND c.staff_id=$3::text
         AND c.status IN('ACTIVE','ENDED')
         AND c.effective_from <= $4::date
         AND (c.effective_to IS NULL OR c.effective_to >= $4::date)
         AND b."companyId"=$2::text
         AND ($5::text[] IS NULL OR c.branch_id=ANY($5::text[]))
       ORDER BY c.effective_from DESC LIMIT 1`,
      tenantId,
      companyId,
      staffId,
      date,
      branchIds,
    );
    if (!rows.length) throw new NotFoundException('No active net salary contract covers the requested date.');
    return rows[0];
  }

  async create(staffId: string, input: any, userId: string) {
    const { tenantId, companyId, branchIds } = await this.context();
    const effectiveFrom = this.validDate(input?.effectiveFrom, 'effectiveFrom');
    const effectiveTo = input?.effectiveTo ? this.validDate(input.effectiveTo, 'effectiveTo') : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo must be on or after effectiveFrom.');
    }
    const netAmount = this.amount(input?.netAmount);
    const salaryBasis = String(input?.salaryBasis ?? 'MONTHLY_NET').trim().toUpperCase();
    if (!['MONTHLY_NET', 'DAILY_NET', 'HOURLY_NET'].includes(salaryBasis)) {
      throw new BadRequestException('salaryBasis is invalid.');
    }
    const currency = String(input?.currency ?? 'TRY').trim().toUpperCase();
    if (currency.length !== 3) throw new BadRequestException('currency must be a 3-letter code.');

    return this.prisma.$transaction(async (tx) => {
      const staff = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id,s."branchId" AS "branchId"
         FROM staff s JOIN branches b ON b.id=s."branchId"
         WHERE s.id=$1::text AND s."tenantId"=$2::text AND b."companyId"=$3::text
           AND ($4::text[] IS NULL OR s."branchId"=ANY($4::text[]))
         LIMIT 1 FOR UPDATE`,
        staffId,
        tenantId,
        companyId,
        branchIds,
      );
      if (!staff.length) throw new NotFoundException('Staff member not found.');
      const branchId = staff[0].branchId;

      const overlap = await tx.$queryRawUnsafe<any[]>(
        `SELECT id,effective_from AS "effectiveFrom",effective_to AS "effectiveTo"
         FROM hr_salary_contracts
         WHERE tenant_id=$1::text AND company_id=$2::text AND staff_id=$3::text
           AND status IN('ACTIVE','ENDED')
           AND effective_from <= COALESCE($5::date,'9999-12-31'::date)
           AND COALESCE(effective_to,'9999-12-31'::date) >= $4::date
         LIMIT 1`,
        tenantId,
        companyId,
        staffId,
        effectiveFrom,
        effectiveTo,
      );
      if (overlap.length) {
        throw new BadRequestException('The requested salary contract date range overlaps an active contract.');
      }

      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_salary_contracts(
           tenant_id,company_id,branch_id,staff_id,salary_basis,net_amount,currency,
           effective_from,effective_to,status,note,created_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8::date,$9::date,'ACTIVE',$10,$11::text)
         RETURNING id,staff_id AS "staffId",branch_id AS "branchId",salary_basis AS "salaryBasis",
                   net_amount AS "netAmount",currency,effective_from AS "effectiveFrom",
                   effective_to AS "effectiveTo",status,note,created_at AS "createdAt"`,
        tenantId,
        companyId,
        branchId,
        staffId,
        salaryBasis,
        netAmount,
        currency,
        effectiveFrom,
        effectiveTo,
        input?.note ? String(input.note).trim() : null,
        userId,
      );
      return rows[0];
    });
  }

  async end(id: string, effectiveToInput: string) {
    const { tenantId, companyId, branchIds } = await this.context();
    const effectiveTo = this.validDate(effectiveToInput, 'effectiveTo');
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE hr_salary_contracts
       SET effective_to=$2::date,status='ENDED',updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text
         AND status='ACTIVE' AND effective_from <= $2::date
         AND ($5::text[] IS NULL OR branch_id=ANY($5::text[]))
       RETURNING id,staff_id AS "staffId",salary_basis AS "salaryBasis",net_amount AS "netAmount",
                 currency,effective_from AS "effectiveFrom",effective_to AS "effectiveTo",status`,
      id,
      effectiveTo,
      tenantId,
      companyId,
      branchIds,
    );
    if (!rows.length) throw new BadRequestException('Active salary contract not found or end date is invalid.');
    return rows[0];
  }
}
