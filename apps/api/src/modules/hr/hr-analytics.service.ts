import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class HrAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private async context() {
    const scope = await this.organizationScope.getBranchScopedWhere();
    const branchIds =
      'branchId' in scope
        ? typeof scope.branchId === 'string'
          ? [scope.branchId]
          : scope.branchId.in
        : null;

    return {
      tenantId: scope.tenantId,
      companyId: this.tenant.getCompanyId(),
      branchIds,
    };
  }

  async summary(year: number, month: number) {
    const { tenantId, companyId, branchIds } = await this.context();
    const y = Number(year);
    const m = Number(month);

    const [headcount, attendance, leaves, payroll] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) FILTER(WHERE s.status='ACTIVE')::int AS active,
                COUNT(*) FILTER(WHERE s.status<>'ACTIVE')::int AS inactive
         FROM staff s
         JOIN branches b ON b.id=s."branchId"
         WHERE s."tenantId"=$1::text
           AND b."companyId"=$2::text
           AND ($3::text[] IS NULL OR s."branchId"=ANY($3::text[]))`,
        tenantId,
        companyId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS records,
                COALESCE(SUM(worked_minutes),0)::int AS "workedMinutes",
                COALESCE(SUM(overtime_minutes),0)::int AS "overtimeMinutes",
                COUNT(*) FILTER(WHERE status='ABSENT')::int AS "absentRecords"
         FROM attendance_records
         WHERE tenant_id=$1::text
           AND EXTRACT(YEAR FROM work_date)=$2
           AND EXTRACT(MONTH FROM work_date)=$3
           AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))`,
        tenantId,
        y,
        m,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) FILTER(WHERE status='PENDING')::int AS pending,
                COUNT(*) FILTER(WHERE status='APPROVED')::int AS approved,
                COALESCE(SUM(days) FILTER(WHERE status='APPROVED'),0)::numeric AS "approvedDays",
                COALESCE(SUM(days) FILTER(WHERE status='APPROVED' AND type='UNPAID'),0)::numeric AS "unpaidDays"
         FROM leave_requests
         WHERE tenant_id=$1::text
           AND EXTRACT(YEAR FROM start_date)=$2
           AND EXTRACT(MONTH FROM start_date)=$3
           AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))`,
        tenantId,
        y,
        m,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `WITH p AS (
           SELECT id,status
           FROM payroll_periods
           WHERE tenant_id=$1::text
             AND company_id=$2::text
             AND year=$3
             AND month=$4
             AND ($5::text[] IS NULL OR branch_id=ANY($5::text[]))
           LIMIT 1
         )
         SELECT p.id AS "periodId",p.status,COUNT(pi.id)::int AS "employeeCount",
                COALESCE(SUM(pi.gross_amount),0)::numeric AS gross,
                COALESCE(SUM(pi.net_amount),0)::numeric AS net,
                COALESCE(SUM(pi.employer_cost),0)::numeric AS "employerCost",
                COALESCE((SELECT SUM(sp.amount) FROM salary_payments sp WHERE sp.period_id=p.id AND sp.status='PAID'),0)::numeric AS "salaryPaid",
                COALESCE((SELECT SUM(plp.amount) FROM payroll_liability_payments plp WHERE plp.period_id=p.id AND plp.status='PAID'),0)::numeric AS "liabilitiesPaid"
         FROM p
         LEFT JOIN payroll_items pi ON pi.period_id=p.id
         GROUP BY p.id,p.status`,
        tenantId,
        companyId,
        y,
        m,
        branchIds,
      ),
    ]);

    return {
      year: y,
      month: m,
      headcount: headcount[0] ?? { active: 0, inactive: 0 },
      attendance: attendance[0] ?? {},
      leaves: leaves[0] ?? {},
      payroll: payroll[0] ?? null,
    };
  }
}
