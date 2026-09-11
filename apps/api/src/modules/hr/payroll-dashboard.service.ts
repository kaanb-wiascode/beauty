import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollDashboardService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}
  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}

  async summary(year?:number,month?:number){
    const {tenantId,companyId,branchId}=this.context();
    const now=new Date(); const y=year??now.getFullYear(); const m=month??now.getMonth()+1;
    const [periods,totals,settlements,costCenters]=await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pp.id,pp.year,pp.month,pp.status,pp.branch_id AS "branchId",b.name AS "branchName",pp.approved_at AS "approvedAt",pp.posted_at AS "postedAt",pp.cancelled_at AS "cancelledAt",pp.reversed_at AS "reversedAt"
         FROM payroll_periods pp LEFT JOIN branches b ON b.id=pp.branch_id
         WHERE pp.tenant_id=$1::text AND pp.company_id=$2::text
           AND ($3::text IS NULL OR pp.branch_id=$3::text OR pp.branch_id IS NULL)
         ORDER BY pp.year DESC,pp.month DESC LIMIT 12`,tenantId,companyId,branchId),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(DISTINCT pi.staff_id)::int AS "employeeCount",COALESCE(SUM(pi.gross_amount),0)::numeric AS gross,
                COALESCE(SUM(pi.net_amount),0)::numeric AS net,COALESCE(SUM(pi.employer_cost),0)::numeric AS "employerCost",
                COALESCE(SUM(pi.income_tax+pi.stamp_tax),0)::numeric AS tax,
                COALESCE(SUM(pi.employee_social_security+pi.unemployment_employee+pi.employer_social_security+pi.unemployment_employer),0)::numeric AS social,
                COALESCE(SUM(pi.other_deductions),0)::numeric AS other
         FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id
         WHERE pi.tenant_id=$1::text AND pi.company_id=$2::text AND pp.year=$3 AND pp.month=$4
           AND ($5::text IS NULL OR pi.branch_id=$5::text)`,tenantId,companyId,y,m,branchId),
      this.prisma.$queryRawUnsafe<any[]>(
        `WITH salary AS (
           SELECT COALESCE(SUM(sp.amount) FILTER(WHERE sp.status='PAID'),0)::numeric AS paid
           FROM salary_payments sp JOIN payroll_periods pp ON pp.id=sp.period_id
           WHERE sp.tenant_id=$1::text AND sp.company_id=$2::text AND pp.year=$3 AND pp.month=$4
             AND ($5::text IS NULL OR sp.branch_id=$5::text)
         ), liabilities AS (
           SELECT COALESCE(SUM(plp.amount) FILTER(WHERE plp.type='TAX'),0)::numeric AS tax,
                  COALESCE(SUM(plp.amount) FILTER(WHERE plp.type='SOCIAL_SECURITY'),0)::numeric AS social,
                  COALESCE(SUM(plp.amount) FILTER(WHERE plp.type='OTHER'),0)::numeric AS other
           FROM payroll_liability_payments plp JOIN payroll_periods pp ON pp.id=plp.period_id
           WHERE plp.tenant_id=$1::text AND plp.company_id=$2::text AND pp.year=$3 AND pp.month=$4
             AND ($5::text IS NULL OR plp.branch_id=$5::text)
         ) SELECT salary.paid AS "salaryPaid",liabilities.tax AS "taxPaid",liabilities.social AS "socialPaid",liabilities.other AS "otherPaid" FROM salary CROSS JOIN liabilities`,tenantId,companyId,y,m,branchId),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pi.cost_center_id AS "costCenterId",COALESCE(cc.code,'UNALLOCATED') AS code,COALESCE(cc.name,'Dağıtılmamış') AS name,
                COALESCE(SUM(pi.employer_cost),0)::numeric AS amount,COUNT(*)::int AS "employeeCount"
         FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id LEFT JOIN cost_centers cc ON cc.id=pi.cost_center_id
         WHERE pi.tenant_id=$1::text AND pi.company_id=$2::text AND pp.year=$3 AND pp.month=$4
           AND ($5::text IS NULL OR pi.branch_id=$5::text)
         GROUP BY pi.cost_center_id,cc.code,cc.name ORDER BY amount DESC`,tenantId,companyId,y,m,branchId),
    ]);
    const t=totals[0]??{}; const s=settlements[0]??{};
    return {period:{year:y,month:m},totals:t,settlements:{salaryPaid:s.salaryPaid??0,salaryRemaining:Number(t.net??0)-Number(s.salaryPaid??0),taxPaid:s.taxPaid??0,taxRemaining:Number(t.tax??0)-Number(s.taxPaid??0),socialPaid:s.socialPaid??0,socialRemaining:Number(t.social??0)-Number(s.socialPaid??0),otherPaid:s.otherPaid??0,otherRemaining:Number(t.other??0)-Number(s.otherPaid??0)},costCenters,periods};
  }
}
