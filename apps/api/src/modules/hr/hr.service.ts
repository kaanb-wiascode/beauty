import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { TenantContext } from '../../common/tenant/tenant-context';

type StaffProfile = Record<string, unknown>;

type EmployeeMasterRecord = {
  staffId: string;
  employeeNumber: string | null;
  identityNumber: string | null;
  dateOfBirth: string | null;
  personalEmail: string | null;
  address: string | null;
  employmentType: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  bankName: string | null;
  iban: string | null;
  grossSalary: string | number | null;
  salaryType: string | null;
};

type HrScope = {
  tenantId: string;
  companyId: string;
  selectedBranchId: string | null;
  branchIds: string[] | null;
};

function asJsonInput(value: StaffProfile): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  private async scope(): Promise<HrScope> {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const selectedBranchId = this.tenantContext.getBranchId();
    if (!tenantId) throw new BadRequestException('Tenant context is required.');
    if (!companyId) throw new BadRequestException('Company context is required.');

    const scope = await this.organizationScope.getBranchScopedWhere();
    if ('branchId' in scope) {
      return {
        tenantId,
        companyId,
        selectedBranchId,
        branchIds:
          typeof scope.branchId === 'string'
            ? [scope.branchId]
            : scope.branchId.in,
      };
    }

    return { tenantId, companyId, selectedBranchId, branchIds: null };
  }

  private staffWhere(scope: HrScope) {
    return scope.branchIds === null
      ? { tenantId: scope.tenantId, branch: { companyId: scope.companyId } }
      : { tenantId: scope.tenantId, branchId: { in: scope.branchIds } };
  }

  private async writableBranch(
    scope: HrScope,
    requestedBranchId?: string | null,
  ) {
    const branchId = requestedBranchId ?? scope.selectedBranchId;
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }
    if (scope.branchIds !== null && !scope.branchIds.includes(branchId)) {
      throw new BadRequestException('Branch is outside the active organization scope.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        companyId: scope.companyId,
        company: { tenantId: scope.tenantId },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Branch is not available in this tenant.');
    return branchId;
  }

  private async assertStaffInBranch(
    tenantId: string,
    staffId: string,
    branchId: string,
  ) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, branchId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
  }

  private profile(value: unknown): StaffProfile {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as StaffProfile)
      : {};
  }

  private nullableString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
  }

  private nullableDate(value: unknown, field: string): string | null {
    const normalized = this.nullableString(value);
    if (!normalized) return null;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date.`);
    }
    return date.toISOString().slice(0, 10);
  }

  private nullableAmount(value: unknown, field: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const amount = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(`${field} must be a non-negative number.`);
    }
    return amount;
  }

  private async employeeMasterRows(tenantId: string, branchIds: string[] | null) {
    return this.prisma.$queryRawUnsafe<EmployeeMasterRecord[]>(
      `SELECT emr.staff_id AS "staffId",emr.employee_number AS "employeeNumber",emr.national_identity_number AS "identityNumber",emr.date_of_birth::text AS "dateOfBirth",emr.personal_email AS "personalEmail",emr.address,emr.employment_type AS "employmentType",emr.hire_date::text AS "hireDate",emr.termination_date::text AS "terminationDate",emr.bank_name AS "bankName",emr.iban,emr.gross_salary AS "grossSalary",emr.salary_type AS "salaryType" FROM employee_master_records emr WHERE emr.tenant_id=$1 AND ($2::text[] IS NULL OR emr.branch_id=ANY($2::text[]))`,
      tenantId,
      branchIds,
    );
  }

  private async employeeMaster(
    staffId: string,
    tenantId: string,
  ): Promise<EmployeeMasterRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<EmployeeMasterRecord[]>(
      `SELECT emr.staff_id AS "staffId",emr.employee_number AS "employeeNumber",emr.national_identity_number AS "identityNumber",emr.date_of_birth::text AS "dateOfBirth",emr.personal_email AS "personalEmail",emr.address,emr.employment_type AS "employmentType",emr.hire_date::text AS "hireDate",emr.termination_date::text AS "terminationDate",emr.bank_name AS "bankName",emr.iban,emr.gross_salary AS "grossSalary",emr.salary_type AS "salaryType" FROM employee_master_records emr WHERE emr.staff_id=$1 AND emr.tenant_id=$2 LIMIT 1`,
      staffId,
      tenantId,
    );
    return rows[0] ?? null;
  }

  private async assertMasterUnique(
    tenantId: string,
    employeeNumber: string | null,
    identityNumber: string | null,
    excludeStaffId?: string,
  ) {
    if (employeeNumber) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ staffId: string }>>(
        `SELECT staff_id AS "staffId" FROM employee_master_records WHERE tenant_id=$1 AND employee_number=$2 ${excludeStaffId ? 'AND staff_id<>$3' : ''} LIMIT 1`,
        ...(excludeStaffId
          ? [tenantId, employeeNumber, excludeStaffId]
          : [tenantId, employeeNumber]),
      );
      if (rows.length) {
        throw new BadRequestException(
          'An employee with this personnel number already exists.',
        );
      }
    }
    if (identityNumber) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ staffId: string }>>(
        `SELECT staff_id AS "staffId" FROM employee_master_records WHERE tenant_id=$1 AND national_identity_number=$2 ${excludeStaffId ? 'AND staff_id<>$3' : ''} LIMIT 1`,
        ...(excludeStaffId
          ? [tenantId, identityNumber, excludeStaffId]
          : [tenantId, identityNumber]),
      );
      if (rows.length) {
        throw new BadRequestException(
          'An employee with this identity number already exists.',
        );
      }
    }
  }

  private legacyProfile(body: any, existing?: StaffProfile): StaffProfile {
    const profile = { ...(existing ?? {}) };
    for (const key of [
      'department',
      'position',
      'annualLeaveDays',
      'usedLeaveDays',
      'pendingLeaveDays',
    ]) {
      if (body[key] !== undefined) profile[key] = body[key];
    }
    return profile;
  }

  private masterValues(
    body: any,
    existing: EmployeeMasterRecord | null,
    profile: StaffProfile,
  ) {
    const currentSalary = existing?.grossSalary ?? profile.salary ?? null;
    return {
      employeeNumber:
        body.personnelNumber !== undefined
          ? this.nullableString(body.personnelNumber)
          : (existing?.employeeNumber ?? this.nullableString(profile.personnelNumber)),
      identityNumber:
        body.identityNumber !== undefined
          ? this.nullableString(body.identityNumber)
          : (existing?.identityNumber ?? this.nullableString(profile.identityNumber)),
      dateOfBirth:
        body.dateOfBirth !== undefined
          ? this.nullableDate(body.dateOfBirth, 'dateOfBirth')
          : (existing?.dateOfBirth ?? this.nullableDate(profile.dateOfBirth, 'dateOfBirth')),
      personalEmail:
        body.personalEmail !== undefined
          ? this.nullableString(body.personalEmail)
          : (existing?.personalEmail ?? this.nullableString(profile.personalEmail)),
      address:
        body.address !== undefined
          ? this.nullableString(body.address)
          : (existing?.address ?? this.nullableString(profile.address)),
      employmentType:
        body.employmentType !== undefined
          ? this.nullableString(body.employmentType)
          : (existing?.employmentType ?? this.nullableString(profile.employmentType)),
      hireDate:
        body.hireDate !== undefined
          ? this.nullableDate(body.hireDate, 'hireDate')
          : (existing?.hireDate ?? this.nullableDate(profile.hireDate, 'hireDate')),
      terminationDate:
        body.terminationDate !== undefined
          ? this.nullableDate(body.terminationDate, 'terminationDate')
          : (existing?.terminationDate ?? this.nullableDate(profile.terminationDate, 'terminationDate')),
      bankName:
        body.bankName !== undefined
          ? this.nullableString(body.bankName)
          : (existing?.bankName ?? this.nullableString(profile.bankName)),
      iban:
        body.iban !== undefined
          ? this.nullableString(body.iban)
          : (existing?.iban ?? this.nullableString(profile.iban)),
      grossSalary:
        body.grossSalary !== undefined || body.salary !== undefined
          ? this.nullableAmount(body.grossSalary ?? body.salary, 'grossSalary')
          : this.nullableAmount(currentSalary, 'grossSalary'),
      salaryType:
        body.salaryType !== undefined
          ? this.nullableString(body.salaryType)
          : (existing?.salaryType ?? this.nullableString(profile.salaryType)),
    };
  }

  private async upsertEmployeeMaster(
    tx: any,
    tenantId: string,
    branchId: string,
    staffId: string,
    values: ReturnType<HrService['masterValues']>,
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO employee_master_records(staff_id,tenant_id,branch_id,employee_number,national_identity_number,date_of_birth,personal_email,address,employment_type,hire_date,termination_date,bank_name,iban,gross_salary,salary_type) VALUES($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15) ON CONFLICT(staff_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,branch_id=EXCLUDED.branch_id,employee_number=EXCLUDED.employee_number,national_identity_number=EXCLUDED.national_identity_number,date_of_birth=EXCLUDED.date_of_birth,personal_email=EXCLUDED.personal_email,address=EXCLUDED.address,employment_type=EXCLUDED.employment_type,hire_date=EXCLUDED.hire_date,termination_date=EXCLUDED.termination_date,bank_name=EXCLUDED.bank_name,iban=EXCLUDED.iban,gross_salary=EXCLUDED.gross_salary,salary_type=EXCLUDED.salary_type,updated_at=CURRENT_TIMESTAMP`,
      staffId,
      tenantId,
      branchId,
      values.employeeNumber,
      values.identityNumber,
      values.dateOfBirth,
      values.personalEmail,
      values.address,
      values.employmentType,
      values.hireDate,
      values.terminationDate,
      values.bankName,
      values.iban,
      values.grossSalary,
      values.salaryType,
    );
  }

  async employees(includeSensitive = false) {
    const scope = await this.scope();
    const rows = await this.prisma.staff.findMany({
      where: this.staffWhere(scope),
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
        branchId: true,
        profile: true,
      },
    });
    const [masters, assignments] = await Promise.all([
      this.employeeMasterRows(scope.tenantId, scope.branchIds),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT ON (a.staff_id) a.staff_id AS "staffId",a.department_id AS "departmentId",d.name AS department,a.team_id AS "teamId",t.name AS team,a.position_id AS "positionId",p.name AS position,a.manager_staff_id AS "managerStaffId"
         FROM hr_employee_assignments a
         LEFT JOIN hr_departments d ON d.id=a.department_id
         LEFT JOIN hr_teams t ON t.id=a.team_id
         LEFT JOIN hr_positions p ON p.id=a.position_id
         WHERE a.tenant_id=$1
           AND ($2::text[] IS NULL OR a.branch_id=ANY($2::text[]))
           AND a.effective_from<=CURRENT_DATE
           AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE)
         ORDER BY a.staff_id,a.effective_from DESC,a.created_at DESC`,
        scope.tenantId,
        scope.branchIds,
      ),
    ]);
    const masterByStaffId = new Map(masters.map((item) => [item.staffId, item]));
    const assignmentByStaffId = new Map(assignments.map((item) => [item.staffId, item]));
    return rows.map((staff) => {
      const profile = this.profile(staff.profile);
      const master = masterByStaffId.get(staff.id);
      const assignment = assignmentByStaffId.get(staff.id);
      const base = {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        phone: staff.phone,
        email: staff.email,
        status: staff.status,
        branchId: staff.branchId,
        personnelNumber: master?.employeeNumber ?? profile.personnelNumber ?? null,
        departmentId: assignment?.departmentId ?? null,
        department: assignment?.department ?? profile.department ?? null,
        teamId: assignment?.teamId ?? null,
        team: assignment?.team ?? null,
        positionId: assignment?.positionId ?? null,
        position: assignment?.position ?? profile.position ?? null,
        managerStaffId: assignment?.managerStaffId ?? null,
        employmentType: master?.employmentType ?? profile.employmentType ?? null,
        hireDate: master?.hireDate ?? profile.hireDate ?? null,
        terminationDate: master?.terminationDate ?? profile.terminationDate ?? null,
      };
      if (!includeSensitive) return base;
      return {
        ...base,
        identityNumber: master?.identityNumber ?? profile.identityNumber ?? null,
        dateOfBirth: master?.dateOfBirth ?? profile.dateOfBirth ?? null,
        personalEmail: master?.personalEmail ?? profile.personalEmail ?? null,
        address: master?.address ?? profile.address ?? null,
        iban: master?.iban ?? profile.iban ?? null,
        bankName: master?.bankName ?? profile.bankName ?? null,
        grossSalary:
          master?.grossSalary != null
            ? Number(master.grossSalary)
            : Number(profile.salary ?? 0),
        salaryType: master?.salaryType ?? profile.salaryType ?? null,
      };
    });
  }

  async personnelFiles(includeSensitive = false) {
    return this.employees(includeSensitive);
  }

  async createEmployee(body: any) {
    const scope = await this.scope();
    const targetBranchId = await this.writableBranch(scope, body.branchId);
    if (!body.firstName || !body.lastName) {
      throw new BadRequestException('firstName, lastName and branchId are required.');
    }
    if (body.email) {
      const existing = await this.prisma.staff.findFirst({
        where: { tenantId: scope.tenantId, email: body.email },
      });
      if (existing) {
        throw new BadRequestException('A staff member with this email already exists.');
      }
    }
    let department: any = null;
    let position: any = null;
    let team: any = null;
    if (body.departmentId) {
      department = (await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,name FROM hr_departments WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND status='ACTIVE' LIMIT 1`,
        body.departmentId,
        scope.tenantId,
        scope.companyId,
      ))[0];
      if (!department) throw new BadRequestException('Department is not available in the active company.');
    }
    if (body.teamId) {
      team = (await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT t.id,t.name,t.department_id FROM hr_teams t JOIN hr_departments d ON d.id=t.department_id WHERE t.id=$1 AND t.tenant_id=$2 AND d.company_id=$3 AND t.status='ACTIVE' LIMIT 1`,
        body.teamId,
        scope.tenantId,
        scope.companyId,
      ))[0];
      if (!team) throw new BadRequestException('Team is not available in the active company.');
      if (body.departmentId && team.department_id !== body.departmentId) {
        throw new BadRequestException('Team does not belong to the selected department.');
      }
    }
    if (body.positionId) {
      position = (await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id,name,department_id FROM hr_positions WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND status='ACTIVE' LIMIT 1`,
        body.positionId,
        scope.tenantId,
        scope.companyId,
      ))[0];
      if (!position) throw new BadRequestException('Position is not available in the active company.');
      if (body.departmentId && position.department_id && position.department_id !== body.departmentId) {
        throw new BadRequestException('Position does not belong to the selected department.');
      }
    }
    const profile = this.legacyProfile({
      ...body,
      department: department?.name ?? body.department,
      position: position?.name ?? body.position,
    });
    const master = this.masterValues(body, null, {});
    await this.assertMasterUnique(
      scope.tenantId,
      master.employeeNumber,
      master.identityNumber,
    );
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          tenantId: scope.tenantId,
          branchId: targetBranchId,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone ?? null,
          email: body.email ?? null,
          status: body.status ?? 'ACTIVE',
          profile: asJsonInput(profile),
        },
      });
      await this.upsertEmployeeMaster(
        tx,
        scope.tenantId,
        targetBranchId,
        created.id,
        master,
      );
      if (body.departmentId || body.teamId || body.positionId || body.managerStaffId) {
        if (body.managerStaffId === created.id) {
          throw new BadRequestException('An employee cannot be their own manager.');
        }
        if (body.managerStaffId) {
          const manager = await tx.staff.findFirst({
            where: {
              id: body.managerStaffId,
              tenantId: scope.tenantId,
              status: 'ACTIVE',
              branch: { companyId: scope.companyId },
            },
            select: { id: true },
          });
          if (!manager) throw new BadRequestException('Manager is outside the active organization scope.');
        }
        const effectiveFrom = master.hireDate ?? new Date().toISOString().slice(0, 10);
        await tx.$executeRawUnsafe(
          `INSERT INTO hr_employee_assignments(id,tenant_id,company_id,branch_id,staff_id,department_id,team_id,position_id,manager_staff_id,effective_from,reason)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11)`,
          `asg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          scope.tenantId,
          scope.companyId,
          targetBranchId,
          created.id,
          body.departmentId ?? position?.department_id ?? team?.department_id ?? null,
          body.teamId ?? null,
          body.positionId ?? null,
          body.managerStaffId ?? null,
          effectiveFrom,
          'INITIAL_ASSIGNMENT',
        );
      }
      return {
        ...created,
        personnelNumber: master.employeeNumber,
        identityNumber: master.identityNumber,
        dateOfBirth: master.dateOfBirth,
        personalEmail: master.personalEmail,
        address: master.address,
        employmentType: master.employmentType,
        hireDate: master.hireDate,
        terminationDate: master.terminationDate,
        iban: master.iban,
        bankName: master.bankName,
        grossSalary: master.grossSalary ?? 0,
        salaryType: master.salaryType,
      };
    });
  }

  async updateEmployee(id: string, body: any) {
    const scope = await this.scope();
    const current = await this.prisma.staff.findFirst({
      where: { id, ...this.staffWhere(scope) },
    });
    if (!current) throw new NotFoundException('Staff not found');
    if (body.branchId && body.branchId !== current.branchId) {
      throw new BadRequestException(
        'Employee branch changes must use the HR organization assignment workflow.',
      );
    }
    if (body.email && body.email !== current.email) {
      const emailOwner = await this.prisma.staff.findFirst({
        where: { tenantId: scope.tenantId, email: body.email, NOT: { id } },
        select: { id: true },
      });
      if (emailOwner) {
        throw new BadRequestException('A staff member with this email already exists.');
      }
    }
    const currentProfile = this.profile(current.profile);
    const currentMaster = await this.employeeMaster(id, scope.tenantId);
    const master = this.masterValues(body, currentMaster, currentProfile);
    await this.assertMasterUnique(
      scope.tenantId,
      master.employeeNumber,
      master.identityNumber,
      id,
    );
    const nextProfile = this.legacyProfile(body, currentProfile);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff.update({
        where: { id },
        data: {
          firstName: body.firstName ?? current.firstName,
          lastName: body.lastName ?? current.lastName,
          phone: body.phone ?? current.phone,
          email: body.email ?? current.email,
          status: body.status ?? current.status,
          profile: asJsonInput(nextProfile),
        },
      });
      await this.upsertEmployeeMaster(
        tx,
        scope.tenantId,
        current.branchId,
        id,
        master,
      );
      return {
        ...updated,
        personnelNumber: master.employeeNumber,
        identityNumber: master.identityNumber,
        dateOfBirth: master.dateOfBirth,
        personalEmail: master.personalEmail,
        address: master.address,
        employmentType: master.employmentType,
        hireDate: master.hireDate,
        terminationDate: master.terminationDate,
        iban: master.iban,
        bankName: master.bankName,
        grossSalary: master.grossSalary ?? 0,
        salaryType: master.salaryType,
      };
    });
  }

  async deleteEmployee(id: string) {
    const scope = await this.scope();
    const staff = await this.prisma.staff.findFirst({
      where: { id, ...this.staffWhere(scope) },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return this.prisma.staff.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async attendance(year?: number, month?: number) {
    const scope = await this.scope();
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT a.id,a.staff_id AS "staffId",s."firstName",s."lastName",a.work_date AS "date",a.status,a.check_in AS "checkIn",a.check_out AS "checkOut",a.worked_minutes AS "workedMinutes",a.overtime_minutes AS "overtimeMinutes",a.note FROM attendance_records a JOIN staff s ON s.id=a.staff_id WHERE a.tenant_id=$1 AND ($2::text[] IS NULL OR a.branch_id=ANY($2::text[])) AND EXTRACT(YEAR FROM a.work_date)=$3 AND EXTRACT(MONTH FROM a.work_date)=$4 ORDER BY a.work_date DESC,s."firstName"`,
      scope.tenantId,
      scope.branchIds,
      y,
      m,
    );
  }

  async upsertAttendance(body: any) {
    const scope = await this.scope();
    const branchId = await this.writableBranch(scope, body.branchId);
    if (!body.staffId || !body.date) {
      throw new BadRequestException('staffId and date are required');
    }
    await this.assertStaffInBranch(scope.tenantId, body.staffId, branchId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO attendance_records(id,tenant_id,branch_id,staff_id,work_date,status,check_in,check_out,worked_minutes,overtime_minutes,note,updated_at) VALUES($1,$2,$3,$4,$5::date,$6,$7::time,$8::time,$9,$10,$11,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,staff_id,work_date) DO UPDATE SET branch_id=EXCLUDED.branch_id,status=EXCLUDED.status,check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,worked_minutes=EXCLUDED.worked_minutes,overtime_minutes=EXCLUDED.overtime_minutes,note=EXCLUDED.note,updated_at=CURRENT_TIMESTAMP`,
      body.id ?? `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      scope.tenantId,
      branchId,
      body.staffId,
      body.date,
      body.status ?? 'PRESENT',
      body.checkIn ?? null,
      body.checkOut ?? null,
      Number(body.workedMinutes ?? 0),
      Number(body.overtimeMinutes ?? 0),
      body.note ?? null,
    );
    return { success: true };
  }

  async leaves() {
    const scope = await this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT l.id,l.staff_id AS "staffId",s."firstName",s."lastName",l.leave_type AS "leaveType",l.start_date AS "startDate",l.end_date AS "endDate",l.days,l.status,l.reason,l.approved_by AS "approvedBy",l.created_at AS "createdAt" FROM leave_requests l JOIN staff s ON s.id=l.staff_id WHERE l.tenant_id=$1 AND ($2::text[] IS NULL OR l.branch_id=ANY($2::text[])) ORDER BY l.created_at DESC`,
      scope.tenantId,
      scope.branchIds,
    );
  }

  async createLeave(body: any) {
    const scope = await this.scope();
    const branchId = await this.writableBranch(scope, body.branchId);
    if (!body.staffId || !body.startDate || !body.endDate) {
      throw new BadRequestException('staffId, startDate and endDate are required');
    }
    await this.assertStaffInBranch(scope.tenantId, body.staffId, branchId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO leave_requests(id,tenant_id,branch_id,staff_id,leave_type,start_date,end_date,days,status,reason,updated_at) VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,CURRENT_TIMESTAMP)`,
      body.id ?? `leave_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      scope.tenantId,
      branchId,
      body.staffId,
      body.leaveType ?? 'ANNUAL',
      body.startDate,
      body.endDate,
      Number(body.days ?? 1),
      body.status ?? 'PENDING',
      body.reason ?? null,
    );
    return { success: true };
  }

  async updateLeave(id: string, body: any) {
    const scope = await this.scope();
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE leave_requests SET leave_type=COALESCE($1,leave_type),start_date=COALESCE($2::date,start_date),end_date=COALESCE($3::date,end_date),days=COALESCE($4,days),status=COALESCE($5,status),reason=COALESCE($6,reason),approved_by=COALESCE($7,approved_by),updated_at=CURRENT_TIMESTAMP WHERE id=$8 AND tenant_id=$9 AND ($10::text[] IS NULL OR branch_id=ANY($10::text[]))`,
      body.leaveType ?? null,
      body.startDate ?? null,
      body.endDate ?? null,
      body.days == null ? null : Number(body.days),
      body.status ?? null,
      body.reason ?? null,
      body.approvedBy ?? null,
      id,
      scope.tenantId,
      scope.branchIds,
    );
    if (!result) throw new NotFoundException('Leave request not found');
    return { success: true };
  }

  async deleteLeave(id: string) {
    const scope = await this.scope();
    const result = await this.prisma.$executeRawUnsafe(
      `DELETE FROM leave_requests WHERE id=$1 AND tenant_id=$2 AND ($3::text[] IS NULL OR branch_id=ANY($3::text[]))`,
      id,
      scope.tenantId,
      scope.branchIds,
    );
    if (!result) throw new NotFoundException('Leave request not found');
    return { success: true };
  }

  async payroll(year?: number, month?: number) {
    const scope = await this.scope();
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT pi.id,pi.staff_id AS "staffId",s."firstName",s."lastName",pp.id AS "periodId",pp.year,pp.month,pp.status AS "periodStatus",pi.gross_amount AS "grossAmount",pi.net_amount AS "netAmount",pi.employer_cost AS "employerCost",pi.status FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id JOIN staff s ON s.id=pi.staff_id WHERE pi.tenant_id=$1 AND ($2::text[] IS NULL OR pi.branch_id=ANY($2::text[])) AND pp.year=$3 AND pp.month=$4 ORDER BY s."firstName"`,
      scope.tenantId,
      scope.branchIds,
      y,
      m,
    );
  }

  async payments(year?: number, month?: number) {
    const scope = await this.scope();
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sp.id,sp.staff_id AS "staffId",s."firstName",s."lastName",sp.amount,sp.method,sp.status,sp.paid_at AS "paidAt",sp.note FROM salary_payments sp JOIN staff s ON s.id=sp.staff_id WHERE sp.tenant_id=$1 AND ($2::text[] IS NULL OR sp.branch_id=ANY($2::text[])) AND EXTRACT(YEAR FROM sp.paid_at)=$3 AND EXTRACT(MONTH FROM sp.paid_at)=$4 ORDER BY sp.paid_at DESC`,
      scope.tenantId,
      scope.branchIds,
      y,
      m,
    );
  }

  async sgk(year?: number, month?: number) {
    const scope = await this.scope();
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sl.id,sl.staff_id AS "staffId",s."firstName",s."lastName",sl.period_year AS "year",sl.period_month AS "month",sl.employee_amount AS "employeeAmount",sl.employer_amount AS "employerAmount",sl.status,sl.due_date AS "dueDate",sl.paid_at AS "paidAt",sl.note FROM sgk_records sl JOIN staff s ON s.id=sl.staff_id WHERE sl.tenant_id=$1 AND ($2::text[] IS NULL OR sl.branch_id=ANY($2::text[])) AND sl.period_year=$3 AND sl.period_month=$4 ORDER BY s."firstName"`,
      scope.tenantId,
      scope.branchIds,
      y,
      m,
    );
  }

  async createSgk(body: any) {
    const scope = await this.scope();
    const branchId = await this.writableBranch(scope, body.branchId);
    if (!body.staffId || !body.year || !body.month) {
      throw new BadRequestException('staffId, year and month are required');
    }
    await this.assertStaffInBranch(scope.tenantId, body.staffId, branchId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO sgk_records(id,tenant_id,branch_id,staff_id,period_year,period_month,employee_amount,employer_amount,status,due_date,note,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,staff_id,period_year,period_month) DO UPDATE SET branch_id=EXCLUDED.branch_id,employee_amount=EXCLUDED.employee_amount,employer_amount=EXCLUDED.employer_amount,status=EXCLUDED.status,due_date=EXCLUDED.due_date,note=EXCLUDED.note,updated_at=CURRENT_TIMESTAMP`,
      body.id ?? `sgk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      scope.tenantId,
      branchId,
      body.staffId,
      Number(body.year),
      Number(body.month),
      Number(body.employeeAmount ?? 0),
      Number(body.employerAmount ?? 0),
      body.status ?? 'PENDING',
      body.dueDate ?? null,
      body.note ?? null,
    );
    return { success: true };
  }
}
