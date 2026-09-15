import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
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

function asJsonInput(value: StaffProfile): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private scope() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const roleScope = this.tenantContext.getRoleScope();
    if (!tenantId) throw new BadRequestException('Tenant context is required.');
    if (roleScope === 'CENTRAL' && branchId === null) return { tenantId, branchId: null, companyId };
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, branchId, companyId };
  }

  private profile(value: unknown): StaffProfile {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as StaffProfile) : {};
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
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date.`);
    return date.toISOString().slice(0, 10);
  }

  private nullableAmount(value: unknown, field: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    const amount = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException(`${field} must be a non-negative number.`);
    return amount;
  }

  private async employeeMasterRows(tenantId: string, branchId: string | null) {
    return this.prisma.$queryRawUnsafe<EmployeeMasterRecord[]>(
      `SELECT
         emr.staff_id AS "staffId",
         emr.employee_number AS "employeeNumber",
         emr.national_identity_number AS "identityNumber",
         emr.date_of_birth::text AS "dateOfBirth",
         emr.personal_email AS "personalEmail",
         emr.address,
         emr.employment_type AS "employmentType",
         emr.hire_date::text AS "hireDate",
         emr.termination_date::text AS "terminationDate",
         emr.bank_name AS "bankName",
         emr.iban,
         emr.gross_salary AS "grossSalary",
         emr.salary_type AS "salaryType"
       FROM employee_master_records emr
       WHERE emr.tenant_id=$1 ${branchId ? 'AND emr.branch_id=$2' : ''}`,
      ...(branchId ? [tenantId, branchId] : [tenantId]),
    );
  }

  private async employeeMaster(staffId: string, tenantId: string): Promise<EmployeeMasterRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<EmployeeMasterRecord[]>(
      `SELECT
         emr.staff_id AS "staffId",
         emr.employee_number AS "employeeNumber",
         emr.national_identity_number AS "identityNumber",
         emr.date_of_birth::text AS "dateOfBirth",
         emr.personal_email AS "personalEmail",
         emr.address,
         emr.employment_type AS "employmentType",
         emr.hire_date::text AS "hireDate",
         emr.termination_date::text AS "terminationDate",
         emr.bank_name AS "bankName",
         emr.iban,
         emr.gross_salary AS "grossSalary",
         emr.salary_type AS "salaryType"
       FROM employee_master_records emr
       WHERE emr.staff_id=$1 AND emr.tenant_id=$2
       LIMIT 1`,
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
        `SELECT staff_id AS "staffId" FROM employee_master_records
         WHERE tenant_id=$1 AND employee_number=$2 ${excludeStaffId ? 'AND staff_id<>$3' : ''} LIMIT 1`,
        ...(excludeStaffId ? [tenantId, employeeNumber, excludeStaffId] : [tenantId, employeeNumber]),
      );
      if (rows.length) throw new BadRequestException('An employee with this personnel number already exists.');
    }
    if (identityNumber) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ staffId: string }>>(
        `SELECT staff_id AS "staffId" FROM employee_master_records
         WHERE tenant_id=$1 AND national_identity_number=$2 ${excludeStaffId ? 'AND staff_id<>$3' : ''} LIMIT 1`,
        ...(excludeStaffId ? [tenantId, identityNumber, excludeStaffId] : [tenantId, identityNumber]),
      );
      if (rows.length) throw new BadRequestException('An employee with this identity number already exists.');
    }
  }

  private legacyProfile(body: any, existing?: StaffProfile): StaffProfile {
    const profile = { ...(existing ?? {}) };
    for (const key of ['department', 'position', 'annualLeaveDays', 'usedLeaveDays', 'pendingLeaveDays']) {
      if (body[key] !== undefined) profile[key] = body[key];
    }
    return profile;
  }

  private masterValues(body: any, existing: EmployeeMasterRecord | null, profile: StaffProfile) {
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
        body.iban !== undefined ? this.nullableString(body.iban) : (existing?.iban ?? this.nullableString(profile.iban)),
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
      `INSERT INTO employee_master_records(
         staff_id,tenant_id,branch_id,employee_number,national_identity_number,date_of_birth,
         personal_email,address,employment_type,hire_date,termination_date,bank_name,iban,gross_salary,salary_type
       ) VALUES($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15)
       ON CONFLICT(staff_id) DO UPDATE SET
         tenant_id=EXCLUDED.tenant_id,
         branch_id=EXCLUDED.branch_id,
         employee_number=EXCLUDED.employee_number,
         national_identity_number=EXCLUDED.national_identity_number,
         date_of_birth=EXCLUDED.date_of_birth,
         personal_email=EXCLUDED.personal_email,
         address=EXCLUDED.address,
         employment_type=EXCLUDED.employment_type,
         hire_date=EXCLUDED.hire_date,
         termination_date=EXCLUDED.termination_date,
         bank_name=EXCLUDED.bank_name,
         iban=EXCLUDED.iban,
         gross_salary=EXCLUDED.gross_salary,
         salary_type=EXCLUDED.salary_type,
         updated_at=CURRENT_TIMESTAMP`,
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

  async employees() {
    const { tenantId, branchId } = this.scope();
    const rows = await this.prisma.staff.findMany({
      where: branchId ? { tenantId, branchId } : { tenantId },
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
    const masters = await this.employeeMasterRows(tenantId, branchId);
    const masterByStaffId = new Map(masters.map((row) => [row.staffId, row]));
    return rows.map((staff) => {
      const profile = this.profile(staff.profile);
      const master = masterByStaffId.get(staff.id);
      return {
        ...staff,
        personnelNumber: master?.employeeNumber ?? profile.personnelNumber ?? null,
        identityNumber: master?.identityNumber ?? profile.identityNumber ?? null,
        dateOfBirth: master?.dateOfBirth ?? profile.dateOfBirth ?? null,
        personalEmail: master?.personalEmail ?? profile.personalEmail ?? null,
        address: master?.address ?? profile.address ?? null,
        department: profile.department ?? null,
        position: profile.position ?? null,
        employmentType: master?.employmentType ?? profile.employmentType ?? null,
        hireDate: master?.hireDate ?? profile.hireDate ?? null,
        terminationDate: master?.terminationDate ?? profile.terminationDate ?? null,
        iban: master?.iban ?? profile.iban ?? null,
        bankName: master?.bankName ?? profile.bankName ?? null,
        grossSalary: master?.grossSalary != null ? Number(master.grossSalary) : Number(profile.salary ?? 0),
        salaryType: master?.salaryType ?? profile.salaryType ?? null,
      };
    });
  }

  async createEmployee(body: any) {
    const { tenantId, branchId } = this.scope();
    const targetBranchId = body.branchId ?? branchId;
    if (!targetBranchId || !body.firstName || !body.lastName) {
      throw new BadRequestException('firstName, lastName and branchId are required.');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: targetBranchId, company: { tenantId } },
      select: { id: true },
    });
    if (!branch) throw new BadRequestException('Branch is not available in this tenant.');
    if (body.email) {
      const existing = await this.prisma.staff.findFirst({ where: { tenantId, email: body.email } });
      if (existing) throw new BadRequestException('A staff member with this email already exists.');
    }
    const profile = this.legacyProfile(body);
    const master = this.masterValues(body, null, {});
    await this.assertMasterUnique(tenantId, master.employeeNumber, master.identityNumber);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          tenantId,
          branchId: targetBranchId,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone ?? null,
          email: body.email ?? null,
          status: body.status ?? 'ACTIVE',
          profile: asJsonInput(profile),
        },
      });
      await this.upsertEmployeeMaster(tx, tenantId, targetBranchId, created.id, master);
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
    const { tenantId, branchId } = this.scope();
    const current = await this.prisma.staff.findFirst({
      where: { id, tenantId, ...(branchId ? { branchId } : {}) },
    });
    if (!current) throw new NotFoundException('Staff not found');
    if (body.email && body.email !== current.email) {
      const emailOwner = await this.prisma.staff.findFirst({
        where: { tenantId, email: body.email, NOT: { id } },
        select: { id: true },
      });
      if (emailOwner) throw new BadRequestException('A staff member with this email already exists.');
    }

    const currentProfile = this.profile(current.profile);
    const currentMaster = await this.employeeMaster(id, tenantId);
    const master = this.masterValues(body, currentMaster, currentProfile);
    await this.assertMasterUnique(tenantId, master.employeeNumber, master.identityNumber, id);
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
      await this.upsertEmployeeMaster(tx, tenantId, current.branchId, id, master);
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
    const { tenantId, branchId } = this.scope();
    const current = await this.prisma.staff.findFirst({ where: { id, tenantId, ...(branchId ? { branchId } : {}) } });
    if (!current) throw new NotFoundException('Staff not found');
    return this.prisma.staff.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async personnelFiles() {
    return this.employees();
  }

  async attendance(year?: number, month?: number) {
    const { tenantId, branchId } = this.scope(), y = year ?? new Date().getFullYear(), m = month ?? new Date().getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT ar.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM attendance_records ar JOIN staff s ON s.id=ar.staff_id WHERE ar.tenant_id=$1 AND EXTRACT(YEAR FROM ar.work_date)=$2 AND EXTRACT(MONTH FROM ar.work_date)=$3 ${branchId ? 'AND ar.branch_id=$4' : ''} ORDER BY ar.work_date,s."firstName"`, ...(branchId ? [tenantId, y, m, branchId] : [tenantId, y, m]));
  }

  async upsertAttendance(b: any) {
    const { tenantId, branchId } = this.scope(), target = b.branchId ?? branchId;
    if (!target || !b.staffId || !b.workDate) throw new BadRequestException('staffId, branchId and workDate are required.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO attendance_records(tenant_id,branch_id,staff_id,work_date,check_in,check_out,break_minutes,worked_minutes,overtime_minutes,status,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(staff_id,work_date) DO UPDATE SET check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,break_minutes=EXCLUDED.break_minutes,worked_minutes=EXCLUDED.worked_minutes,overtime_minutes=EXCLUDED.overtime_minutes,status=EXCLUDED.status,note=EXCLUDED.note,updated_at=CURRENT_TIMESTAMP RETURNING *`, tenantId, target, b.staffId, b.workDate, b.checkIn ?? null, b.checkOut ?? null, Number(b.breakMinutes ?? 0), Number(b.workedMinutes ?? 0), Number(b.overtimeMinutes ?? 0), b.status ?? 'PRESENT', b.note ?? null);
  }

  async leaves() {
    const { tenantId, branchId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT lr.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM leave_requests lr JOIN staff s ON s.id=lr.staff_id WHERE lr.tenant_id=$1 ${branchId ? 'AND lr.branch_id=$2' : ''} ORDER BY lr.start_date DESC,lr.created_at DESC`, ...(branchId ? [tenantId, branchId] : [tenantId]));
  }

  async createLeave(b: any) {
    const { tenantId, branchId } = this.scope(), target = b.branchId ?? branchId;
    if (!target || !b.staffId || !b.type || !b.startDate || !b.endDate) throw new BadRequestException('staffId, branchId, type, startDate and endDate are required.');
    const days = Number(b.days ?? 0);
    if (days <= 0) throw new BadRequestException('days must be greater than zero.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO leave_requests(tenant_id,branch_id,staff_id,type,start_date,end_date,days,status,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, tenantId, target, b.staffId, b.type, b.startDate, b.endDate, days, b.status ?? 'PENDING', b.reason ?? null);
  }

  async updateLeave(id: string, b: any) {
    const { tenantId, branchId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`UPDATE leave_requests SET status=COALESCE($1,status),reason=COALESCE($2,reason),updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND tenant_id=$4 ${branchId ? 'AND branch_id=$5' : ''} RETURNING *`, b.status ?? null, b.reason ?? null, id, tenantId, ...(branchId ? [branchId] : []));
  }

  async deleteLeave(id: string) {
    const { tenantId, branchId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`DELETE FROM leave_requests WHERE id=$1 AND tenant_id=$2 ${branchId ? 'AND branch_id=$3' : ''} RETURNING *`, id, tenantId, ...(branchId ? [branchId] : []));
  }

  async payroll(year?: number, month?: number) {
    const { tenantId, branchId } = this.scope(), y = year ?? new Date().getFullYear(), m = month ?? new Date().getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT pi.*,s."firstName" AS "firstName",s."lastName" AS "lastName",pp.year,pp.month,pp.status AS "periodStatus" FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id JOIN staff s ON s.id=pi.staff_id WHERE pi.tenant_id=$1 AND pp.year=$2 AND pp.month=$3 ${branchId ? 'AND pi.branch_id=$4' : ''} ORDER BY s."firstName",s."lastName"`, ...(branchId ? [tenantId, y, m, branchId] : [tenantId, y, m]));
  }

  async createPayrollPeriod(year: number, month: number) {
    const { tenantId } = this.scope();
    if (month < 1 || month > 12) throw new BadRequestException('month must be between 1 and 12.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO payroll_periods(tenant_id,year,month,status) VALUES($1,$2,$3,'DRAFT') ON CONFLICT(tenant_id,year,month) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING *`, tenantId, year, month);
  }

  async payments(year?: number, month?: number) {
    const { tenantId, branchId } = this.scope(), y = year ?? new Date().getFullYear(), m = month ?? new Date().getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT sp.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM salary_payments sp JOIN payroll_periods pp ON pp.id=sp.period_id JOIN staff s ON s.id=sp.staff_id WHERE sp.tenant_id=$1 AND pp.year=$2 AND pp.month=$3 ${branchId ? 'AND sp.branch_id=$4' : ''} ORDER BY sp.paid_at DESC`, ...(branchId ? [tenantId, y, m, branchId] : [tenantId, y, m]));
  }

  async createPayment(b: any) {
    const { tenantId, branchId } = this.scope();
    if (!branchId || !b.staffId || !b.amount || !b.year || !b.month) throw new BadRequestException('staffId, amount, year and month are required.');
    const period = await this.createPayrollPeriod(Number(b.year), Number(b.month));
    const p = (period as any[])[0];
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO salary_payments(tenant_id,branch_id,period_id,staff_id,amount,method,status,paid_at,note) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_TIMESTAMP),$9) RETURNING *`, tenantId, branchId, p.id, b.staffId, Number(b.amount), b.method ?? 'BANK', b.status ?? 'PAID', b.paidAt ?? null, b.note ?? null);
  }

  async sgk(year?: number, month?: number) {
    const { tenantId, branchId } = this.scope(), y = year ?? new Date().getFullYear(), m = month ?? new Date().getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT sr.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM sgk_records sr JOIN staff s ON s.id=sr.staff_id WHERE sr.tenant_id=$1 AND sr.period_year=$2 AND sr.period_month=$3 ${branchId ? 'AND sr.branch_id=$4' : ''} ORDER BY sr.record_date DESC`, ...(branchId ? [tenantId, y, m, branchId] : [tenantId, y, m]));
  }

  async createSgk(b: any) {
    const { tenantId, branchId } = this.scope();
    if (!branchId || !b.staffId || !b.year || !b.month) throw new BadRequestException('staffId, year and month are required.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO sgk_records(tenant_id,branch_id,staff_id,period_year,period_month,status,document_no,record_date,note) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,CURRENT_DATE),$9) RETURNING *`, tenantId, branchId, b.staffId, Number(b.year), Number(b.month), b.status ?? 'DRAFT', b.documentNo ?? null, b.recordDate ?? null, b.note ?? null);
  }
}
