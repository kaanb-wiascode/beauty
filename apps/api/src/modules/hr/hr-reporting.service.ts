import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

export type HrReportingInput = Readonly<{ from: Date; to: Date }>;

@Injectable()
export class HrReportingService {
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
    return { tenantId: scope.tenantId, companyId: this.tenant.getCompanyId(), branchIds };
  }

  async workforce(input: HrReportingInput) {
    const { tenantId, companyId, branchIds } = await this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      date: Date;
      attendanceRecords: number;
      presentRecords: number;
      absentRecords: number;
      workedMinutes: number;
      overtimeMinutes: number;
      leaveRequests: number;
      approvedLeaveRequests: number;
      approvedLeaveDays: unknown;
    }>>(
      `WITH days AS (
         SELECT generate_series(date_trunc('day',$4::timestamptz),date_trunc('day',$5::timestamptz),'1 day'::interval) AS day
       ), attendance AS (
         SELECT ar.work_date::timestamp AS day,
                COUNT(*)::int AS "attendanceRecords",
                COUNT(*) FILTER (WHERE ar.status<>'ABSENT')::int AS "presentRecords",
                COUNT(*) FILTER (WHERE ar.status='ABSENT')::int AS "absentRecords",
                COALESCE(SUM(ar.worked_minutes),0)::int AS "workedMinutes",
                COALESCE(SUM(ar.overtime_minutes),0)::int AS "overtimeMinutes"
         FROM attendance_records ar
         JOIN branches b ON b.id=ar.branch_id AND b."companyId"=$2::text
         WHERE ar.tenant_id=$1::text
           AND ($3::text[] IS NULL OR ar.branch_id=ANY($3::text[]))
           AND ar.work_date >= $4::date AND ar.work_date <= $5::date
         GROUP BY ar.work_date
       ), leaves AS (
         SELECT lr.start_date::timestamp AS day,
                COUNT(*)::int AS "leaveRequests",
                COUNT(*) FILTER (WHERE lr.status='APPROVED')::int AS "approvedLeaveRequests",
                COALESCE(SUM(lr.days) FILTER (WHERE lr.status='APPROVED'),0)::numeric AS "approvedLeaveDays"
         FROM leave_requests lr
         JOIN branches b ON b.id=lr.branch_id AND b."companyId"=$2::text
         WHERE lr.tenant_id=$1::text
           AND ($3::text[] IS NULL OR lr.branch_id=ANY($3::text[]))
           AND lr.start_date >= $4::date AND lr.start_date <= $5::date
         GROUP BY lr.start_date
       )
       SELECT d.day AS date,
              COALESCE(a."attendanceRecords",0)::int AS "attendanceRecords",
              COALESCE(a."presentRecords",0)::int AS "presentRecords",
              COALESCE(a."absentRecords",0)::int AS "absentRecords",
              COALESCE(a."workedMinutes",0)::int AS "workedMinutes",
              COALESCE(a."overtimeMinutes",0)::int AS "overtimeMinutes",
              COALESCE(l."leaveRequests",0)::int AS "leaveRequests",
              COALESCE(l."approvedLeaveRequests",0)::int AS "approvedLeaveRequests",
              COALESCE(l."approvedLeaveDays",0)::numeric AS "approvedLeaveDays"
       FROM days d LEFT JOIN attendance a ON a.day=d.day LEFT JOIN leaves l ON l.day=d.day
       ORDER BY d.day ASC`,
      tenantId,
      companyId,
      branchIds,
      input.from,
      input.to,
    );

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      attendanceRecords: Number(row.attendanceRecords),
      presentRecords: Number(row.presentRecords),
      absentRecords: Number(row.absentRecords),
      workedMinutes: Number(row.workedMinutes),
      overtimeMinutes: Number(row.overtimeMinutes),
      leaveRequests: Number(row.leaveRequests),
      approvedLeaveRequests: Number(row.approvedLeaveRequests),
      approvedLeaveDays: Number(row.approvedLeaveDays ?? 0),
      absenceRate: Number(row.attendanceRecords)
        ? Math.round((Number(row.absentRecords) / Number(row.attendanceRecords)) * 100)
        : 0,
    }));
  }

  async payroll(input: HrReportingInput) {
    const { tenantId, companyId, branchIds } = await this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      periodDate: Date;
      status: string;
      employeeCount: number;
      gross: unknown;
      net: unknown;
      employerCost: unknown;
      salaryPaid: unknown;
      taxLiability: unknown;
      taxPaid: unknown;
      socialLiability: unknown;
      socialPaid: unknown;
    }>>(
      `WITH period_rows AS (
         SELECT pp.id,make_date(pp.year,pp.month,1) AS period_date,pp.status,
                COUNT(DISTINCT pi.staff_id)::int AS "employeeCount",
                COALESCE(SUM(pi.gross_amount),0)::numeric AS gross,
                COALESCE(SUM(pi.net_amount),0)::numeric AS net,
                COALESCE(SUM(pi.employer_cost),0)::numeric AS "employerCost",
                COALESCE(SUM(pi.income_tax+pi.stamp_tax),0)::numeric AS "taxLiability",
                COALESCE(SUM(pi.employee_social_security+pi.unemployment_employee+pi.employer_social_security+pi.unemployment_employer),0)::numeric AS "socialLiability"
         FROM payroll_periods pp
         LEFT JOIN payroll_items pi ON pi.period_id=pp.id AND pi.tenant_id=pp.tenant_id AND pi.company_id=pp.company_id
         WHERE pp.tenant_id=$1::text AND pp.company_id=$2::text
           AND ($3::text[] IS NULL OR pp.branch_id=ANY($3::text[]))
           AND make_date(pp.year,pp.month,1) >= date_trunc('month',$4::timestamptz)::date
           AND make_date(pp.year,pp.month,1) <= date_trunc('month',$5::timestamptz)::date
         GROUP BY pp.id,pp.year,pp.month,pp.status
       )
       SELECT p.period_date AS "periodDate",p.status,p."employeeCount",p.gross,p.net,p."employerCost",
              COALESCE((SELECT SUM(sp.amount) FROM salary_payments sp
                        WHERE sp.period_id=p.id AND sp.tenant_id=$1::text AND sp.company_id=$2::text
                          AND ($3::text[] IS NULL OR sp.branch_id=ANY($3::text[])) AND sp.status='PAID'),0)::numeric AS "salaryPaid",
              p."taxLiability",
              COALESCE((SELECT SUM(plp.amount) FROM payroll_liability_payments plp
                        WHERE plp.period_id=p.id AND plp.tenant_id=$1::text AND plp.company_id=$2::text
                          AND ($3::text[] IS NULL OR plp.branch_id=ANY($3::text[]))
                          AND plp.type='TAX' AND plp.status='PAID'),0)::numeric AS "taxPaid",
              p."socialLiability",
              COALESCE((SELECT SUM(plp.amount) FROM payroll_liability_payments plp
                        WHERE plp.period_id=p.id AND plp.tenant_id=$1::text AND plp.company_id=$2::text
                          AND ($3::text[] IS NULL OR plp.branch_id=ANY($3::text[]))
                          AND plp.type='SOCIAL_SECURITY' AND plp.status='PAID'),0)::numeric AS "socialPaid"
       FROM period_rows p ORDER BY p.period_date ASC`,
      tenantId,
      companyId,
      branchIds,
      input.from,
      input.to,
    );

    return rows.map((row) => ({
      periodDate: row.periodDate.toISOString().slice(0, 10),
      status: row.status,
      employeeCount: Number(row.employeeCount),
      gross: Number(row.gross ?? 0),
      net: Number(row.net ?? 0),
      employerCost: Number(row.employerCost ?? 0),
      salaryPaid: Number(row.salaryPaid ?? 0),
      salaryRemaining: Math.max(0, Number(row.net ?? 0) - Number(row.salaryPaid ?? 0)),
      taxLiability: Number(row.taxLiability ?? 0),
      taxPaid: Number(row.taxPaid ?? 0),
      taxRemaining: Math.max(0, Number(row.taxLiability ?? 0) - Number(row.taxPaid ?? 0)),
      socialLiability: Number(row.socialLiability ?? 0),
      socialPaid: Number(row.socialPaid ?? 0),
      socialRemaining: Math.max(0, Number(row.socialLiability ?? 0) - Number(row.socialPaid ?? 0)),
      payrollSettlementRate: Number(row.net ?? 0)
        ? Math.round((Number(row.salaryPaid ?? 0) / Number(row.net ?? 0)) * 100)
        : 0,
    }));
  }
}
