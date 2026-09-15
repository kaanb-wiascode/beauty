import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { FieldSecurityService } from '../field-security/field-security.service';

@Injectable()
export class Employee360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationScope: OrganizationScopeService,
    private readonly fieldSecurity: FieldSecurityService,
  ) {}

  private amount(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  async get(staffId: string, includeSensitive = false) {
    const [identityAllowed, compensationAllowed] = includeSensitive
      ? await Promise.all([
          this.fieldSecurity.canRead('hr.employee.identity-banking', { resource: 'hr_sensitive', action: 'read' }),
          this.fieldSecurity.canRead('hr.employee.compensation-payroll', { resource: 'hr_sensitive', action: 'read' }),
        ])
      : [false, false];

    const scope = await this.organizationScope.getBranchScopedWhere();
    const tenantId = scope.tenantId;
    const branchIds =
      'branchId' in scope
        ? typeof scope.branchId === 'string'
          ? [scope.branchId]
          : scope.branchId.in
        : null;

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, ...scope },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        branchId: true,
        profile: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { id: true, name: true, companyId: true } },
      },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const [masterRows, assignments, employment, attendance, leaves, payroll, payments, appointmentStats, recentAppointments] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT employee_number AS "personnelNumber",national_identity_number AS "identityNumber",date_of_birth AS "dateOfBirth",personal_email AS "personalEmail",address,employment_type AS "employmentType",hire_date AS "hireDate",termination_date AS "terminationDate",bank_name AS "bankName",iban,gross_salary AS "grossSalary",salary_type AS "salaryType"
         FROM employee_master_records
         WHERE tenant_id=$1 AND staff_id=$2
           AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))
         LIMIT 1`,
        tenantId,
        staffId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.branch_id AS "branchId",b.name AS "branchName",a.department_id AS "departmentId",d.name AS "departmentName",a.team_id AS "teamId",t.name AS "teamName",a.position_id AS "positionId",p.name AS "positionName",a.manager_staff_id AS "managerStaffId",m."firstName" AS "managerFirstName",m."lastName" AS "managerLastName",a.effective_from AS "effectiveFrom",a.effective_to AS "effectiveTo",a.reason
         FROM hr_employee_assignments a
         JOIN branches b ON b.id=a.branch_id
         LEFT JOIN hr_departments d ON d.id=a.department_id
         LEFT JOIN hr_teams t ON t.id=a.team_id
         LEFT JOIN hr_positions p ON p.id=a.position_id
         LEFT JOIN staff m ON m.id=a.manager_staff_id
         WHERE a.tenant_id=$1 AND a.staff_id=$2
           AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[]))
         ORDER BY a.effective_from DESC,a.created_at DESC`,
        tenantId,
        staffId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT h.id,h.event_type AS "eventType",h.branch_id AS "branchId",b.name AS "branchName",h.effective_from AS "effectiveFrom",h.effective_to AS "effectiveTo",h.employment_type AS "employmentType",h.gross_salary AS "grossSalary",h.salary_type AS "salaryType",h.cost_center_id AS "costCenterId",h.reason,h.metadata,h.created_by AS "createdBy",h.created_at AS "createdAt"
         FROM hr_employment_history h
         JOIN branches b ON b.id=h.branch_id
         WHERE h.tenant_id=$1 AND h.staff_id=$2
           AND ($3::text[] IS NULL OR h.branch_id=ANY($3::text[]))
         ORDER BY h.effective_from DESC,h.created_at DESC`,
        tenantId,
        staffId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS "recordCount",COUNT(*) FILTER(WHERE status='PRESENT')::int AS "presentCount",COALESCE(SUM(worked_minutes),0)::int AS "workedMinutes",COALESCE(SUM(overtime_minutes),0)::int AS "overtimeMinutes",MAX(work_date) AS "lastWorkDate"
         FROM attendance_records
         WHERE tenant_id=$1 AND staff_id=$2
           AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))`,
        tenantId,
        staffId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS "requestCount",COALESCE(SUM(days) FILTER(WHERE status='APPROVED'),0) AS "approvedDays",COALESCE(SUM(days) FILTER(WHERE status='PENDING'),0) AS "pendingDays",MAX(end_date) FILTER(WHERE status='APPROVED') AS "lastApprovedLeaveEnd"
         FROM leave_requests
         WHERE tenant_id=$1 AND staff_id=$2
           AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))`,
        tenantId,
        staffId,
        branchIds,
      ),
      compensationAllowed
        ? this.prisma.$queryRawUnsafe<any[]>(
            `SELECT pp.year,pp.month,pp.status AS "periodStatus",pi.gross_amount AS "grossAmount",pi.net_amount AS "netAmount",pi.employer_cost AS "employerCost"
             FROM payroll_items pi
             JOIN payroll_periods pp ON pp.id=pi.period_id
             WHERE pi.tenant_id=$1 AND pi.staff_id=$2
               AND ($3::text[] IS NULL OR pi.branch_id=ANY($3::text[]))
             ORDER BY pp.year DESC,pp.month DESC LIMIT 12`,
            tenantId,
            staffId,
            branchIds,
          )
        : Promise.resolve([]),
      compensationAllowed
        ? this.prisma.$queryRawUnsafe<any[]>(
            `SELECT sp.amount,sp.method,sp.status,sp.paid_at AS "paidAt",sp.note
             FROM salary_payments sp
             WHERE sp.tenant_id=$1 AND sp.staff_id=$2
               AND ($3::text[] IS NULL OR sp.branch_id=ANY($3::text[]))
             ORDER BY sp.paid_at DESC LIMIT 12`,
            tenantId,
            staffId,
            branchIds,
          )
        : Promise.resolve([]),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS "totalAppointments",COUNT(*) FILTER(WHERE a.status='COMPLETED')::int AS "completedAppointments",COUNT(*) FILTER(WHERE a.status='CANCELLED')::int AS "cancelledAppointments",COALESCE(SUM(p.amount) FILTER(WHERE p.status='COMPLETED'),0) AS "collectedRevenue",MAX(a.start_at) AS "lastAppointmentAt"
         FROM appointments a
         LEFT JOIN payments p ON p.appointment_id=a.id AND p.tenant_id=a.tenant_id
         WHERE a.tenant_id=$1 AND a.staff_id=$2
           AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[]))`,
        tenantId,
        staffId,
        branchIds,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT a.id,a.start_at AS "startAt",a.end_at AS "endAt",a.status,s.name AS "serviceName",c."firstName" AS "customerFirstName",c."lastName" AS "customerLastName"
         FROM appointments a
         JOIN services s ON s.id=a.service_id
         JOIN customers c ON c.id=a.customer_id
         WHERE a.tenant_id=$1 AND a.staff_id=$2
           AND ($3::text[] IS NULL OR a.branch_id=ANY($3::text[]))
         ORDER BY a.start_at DESC LIMIT 10`,
        tenantId,
        staffId,
        branchIds,
      ),
    ]);

    const profile = (
      staff.profile && typeof staff.profile === 'object' && !Array.isArray(staff.profile)
        ? staff.profile
        : {}
    ) as Record<string, unknown>;
    const master = masterRows[0] ?? {};
    const currentAssignment = assignments.find((x: any) => x.effectiveTo == null) ?? assignments[0] ?? null;
    const safeEmployment = employment.map((item: any) =>
      compensationAllowed ? item : { ...item, grossSalary: undefined, salaryType: undefined },
    );
    const timeline = [
      ...safeEmployment.map((x: any) => ({ ...x, source: 'EMPLOYMENT', date: x.effectiveFrom, title: x.eventType })),
      ...assignments.map((x: any) => ({ ...x, source: 'ORGANIZATION', date: x.effectiveFrom, title: x.reason || 'ORGANIZATION_CHANGE' })),
    ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const employee: Record<string, unknown> = {
      ...staff,
      profile: undefined,
      personnelNumber: master.personnelNumber ?? profile.personnelNumber ?? null,
      employmentType: master.employmentType ?? profile.employmentType ?? null,
      hireDate: master.hireDate ?? profile.hireDate ?? null,
      terminationDate: master.terminationDate ?? profile.terminationDate ?? null,
      salaryType: compensationAllowed ? (master.salaryType ?? profile.salaryType ?? null) : undefined,
    };

    if (identityAllowed) {
      Object.assign(employee, {
        identityNumber: master.identityNumber ?? profile.identityNumber ?? null,
        dateOfBirth: master.dateOfBirth ?? profile.dateOfBirth ?? null,
        personalEmail: master.personalEmail ?? profile.personalEmail ?? null,
        address: master.address ?? profile.address ?? null,
        bankName: master.bankName ?? profile.bankName ?? null,
        iban: master.iban ?? profile.iban ?? null,
      });
    }
    if (compensationAllowed) {
      Object.assign(employee, {
        grossSalary: this.amount(master.grossSalary ?? profile.salary),
      });
    }

    return {
      employee,
      organization: { current: currentAssignment, history: assignments },
      employment: { history: safeEmployment, timeline },
      attendance: attendance[0] ?? {},
      leave: leaves[0] ?? {},
      payroll: compensationAllowed ? { recentPeriods: payroll, recentPayments: payments } : undefined,
      performance: { appointments: appointmentStats[0] ?? {}, recentAppointments },
      fieldAccess: {
        identityBanking: identityAllowed,
        compensationPayroll: compensationAllowed,
      },
      sensitiveDataIncluded: identityAllowed || compensationAllowed,
    };
  }
}
