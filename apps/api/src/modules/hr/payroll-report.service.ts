import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollReportService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  async period(periodId:string){
    const {tenantId,companyId,branchId}=this.context();
    const periods=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,year,month,status,branch_id AS "branchId",approved_at AS "approvedAt",posted_at AS "postedAt",journal_entry_id AS "journalEntryId"
       FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id=$4::text OR branch_id IS NULL) LIMIT 1`,periodId,tenantId,companyId,branchId);
    if(!periods.length) throw new NotFoundException('Payroll period not found.');

    const [totals,employees,costCenters,liabilities]=await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS "employeeCount",COALESCE(SUM(gross_amount),0)::numeric AS gross,
                COALESCE(SUM(net_amount),0)::numeric AS net,COALESCE(SUM(employer_cost),0)::numeric AS "employerCost",
                COALESCE(SUM(income_tax+stamp_tax),0)::numeric AS taxes,
                COALESCE(SUM(employee_social_security+unemployment_employee+employer_social_security+unemployment_employer),0)::numeric AS social,
                COALESCE(SUM(other_deductions),0)::numeric AS other
         FROM payroll_items WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text`,periodId,tenantId,companyId),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pi.staff_id AS "staffId",s."firstName",s."lastName",pi.branch_id AS "branchId",pi.cost_center_id AS "costCenterId",
                cc.code AS "costCenterCode",cc.name AS "costCenterName",pi.gross_amount AS gross,pi.net_amount AS net,
                pi.employer_cost AS "employerCost",COALESCE(SUM(sp.amount) FILTER(WHERE sp.status='PAID'),0)::numeric AS paid,
                (pi.net_amount-COALESCE(SUM(sp.amount) FILTER(WHERE sp.status='PAID'),0))::numeric AS remaining
         FROM payroll_items pi JOIN staff s ON s.id=pi.staff_id
         LEFT JOIN cost_centers cc ON cc.id=pi.cost_center_id
         LEFT JOIN salary_payments sp ON sp.period_id=pi.period_id AND sp.staff_id=pi.staff_id AND sp.tenant_id=pi.tenant_id AND sp.company_id=pi.company_id
         WHERE pi.period_id=$1::text AND pi.tenant_id=$2::text AND pi.company_id=$3::text
         GROUP BY pi.staff_id,s."firstName",s."lastName",pi.branch_id,pi.cost_center_id,cc.code,cc.name,pi.gross_amount,pi.net_amount,pi.employer_cost
         ORDER BY s."firstName",s."lastName"`,periodId,tenantId,companyId),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pi.cost_center_id AS "costCenterId",COALESCE(cc.code,'UNALLOCATED') AS code,COALESCE(cc.name,'Unallocated') AS name,
                COUNT(*)::int AS "employeeCount",COALESCE(SUM(pi.employer_cost),0)::numeric AS "employerCost",
                COALESCE(SUM(pi.gross_amount),0)::numeric AS gross
         FROM payroll_items pi LEFT JOIN cost_centers cc ON cc.id=pi.cost_center_id
         WHERE pi.period_id=$1::text AND pi.tenant_id=$2::text AND pi.company_id=$3::text
         GROUP BY pi.cost_center_id,cc.code,cc.name ORDER BY code`,periodId,tenantId,companyId),
      this.prisma.$queryRawUnsafe<any[]>(
        `WITH due AS (
           SELECT COALESCE(SUM(income_tax+stamp_tax),0)::numeric AS tax,
                  COALESCE(SUM(employee_social_security+unemployment_employee+employer_social_security+unemployment_employer),0)::numeric AS social,
                  COALESCE(SUM(other_deductions),0)::numeric AS other
           FROM payroll_items WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ), paid AS (
           SELECT COALESCE(SUM(amount) FILTER(WHERE type='TAX'),0)::numeric AS tax,
                  COALESCE(SUM(amount) FILTER(WHERE type='SOCIAL_SECURITY'),0)::numeric AS social,
                  COALESCE(SUM(amount) FILTER(WHERE type='OTHER'),0)::numeric AS other
           FROM payroll_liability_payments WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         ) SELECT due.tax AS "taxDue",paid.tax AS "taxPaid",(due.tax-paid.tax)::numeric AS "taxRemaining",
                  due.social AS "socialDue",paid.social AS "socialPaid",(due.social-paid.social)::numeric AS "socialRemaining",
                  due.other AS "otherDue",paid.other AS "otherPaid",(due.other-paid.other)::numeric AS "otherRemaining"
           FROM due CROSS JOIN paid`,periodId,tenantId,companyId),
    ]);

    return {period:periods[0],totals:totals[0],employees,costCenters,liabilities:liabilities[0]};
  }
}
