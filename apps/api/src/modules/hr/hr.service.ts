import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type StaffProfile = Record<string, unknown>;

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext) {}

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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as StaffProfile;
  }

  async employees() {
    const { tenantId, branchId } = this.scope();
    const rows = await this.prisma.staff.findMany({
      where: branchId ? { tenantId, branchId } : { tenantId },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, status: true, branchId: true, profile: true },
    });
    return rows.map((s) => {
      const p = this.profile(s.profile);
      return { ...s, personnelNumber: p.personnelNumber ?? null, identityNumber: p.identityNumber ?? null, department: p.department ?? null, position: p.position ?? null, employmentType: p.employmentType ?? null, hireDate: p.hireDate ?? null, iban: p.iban ?? null, bankName: p.bankName ?? null, grossSalary: Number(p.salary ?? 0) };
    });
  }

  async personnelFiles() { return this.employees(); }

  async attendance(year?: number, month?: number) {
    const { tenantId, branchId } = this.scope();
    const y = year ?? new Date().getFullYear(); const m = month ?? new Date().getMonth() + 1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT ar.*, s."firstName" AS "firstName", s."lastName" AS "lastName" FROM attendance_records ar JOIN staff s ON s.id=ar.staff_id WHERE ar.tenant_id=$1 AND EXTRACT(YEAR FROM ar.work_date)=$2 AND EXTRACT(MONTH FROM ar.work_date)=$3 ${branchId ? 'AND ar.branch_id=$4' : ''} ORDER BY ar.work_date,s."firstName"`, ...(branchId ? [tenantId,y,m,branchId] : [tenantId,y,m]));
  }

  async upsertAttendance(body: any) {
    const { tenantId, branchId } = this.scope(); const targetBranch = body.branchId ?? branchId;
    if (!targetBranch || !body.staffId || !body.workDate) throw new BadRequestException('staffId, branchId and workDate are required.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO attendance_records (tenant_id,branch_id,staff_id,work_date,check_in,check_out,break_minutes,worked_minutes,overtime_minutes,status,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (staff_id,work_date) DO UPDATE SET branch_id=EXCLUDED.branch_id,check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,break_minutes=EXCLUDED.break_minutes,worked_minutes=EXCLUDED.worked_minutes,overtime_minutes=EXCLUDED.overtime_minutes,status=EXCLUDED.status,note=EXCLUDED.note,updated_at=CURRENT_TIMESTAMP RETURNING *`, tenantId,targetBranch,body.staffId,body.workDate,body.checkIn??null,body.checkOut??null,Number(body.breakMinutes??0),Number(body.workedMinutes??0),Number(body.overtimeMinutes??0),body.status??'PRESENT',body.note??null);
  }

  async leaves() {
    const { tenantId, branchId } = this.scope();
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT lr.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM leave_requests lr JOIN staff s ON s.id=lr.staff_id WHERE lr.tenant_id=$1 ${branchId?'AND lr.branch_id=$2':''} ORDER BY lr.start_date DESC,lr.created_at DESC`, ...(branchId?[tenantId,branchId]:[tenantId]));
  }

  async createLeave(body: any) {
    const { tenantId, branchId } = this.scope(); const targetBranch=body.branchId??branchId;
    if(!targetBranch||!body.staffId||!body.type||!body.startDate||!body.endDate) throw new BadRequestException('staffId, branchId, type, startDate and endDate are required.');
    const days=Number(body.days??0); if(days<=0) throw new BadRequestException('days must be greater than zero.');
    return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO leave_requests (tenant_id,branch_id,staff_id,type,start_date,end_date,days,status,reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,tenantId,targetBranch,body.staffId,body.type,body.startDate,body.endDate,days,body.status??'PENDING',body.reason??null);
  }

  async payroll(year?: number, month?: number) {
    const { tenantId, branchId }=this.scope(); const y=year??new Date().getFullYear(); const m=month??new Date().getMonth()+1;
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT pi.*,s."firstName" AS "firstName",s."lastName" AS "lastName",pp.year,pp.month,pp.status AS "periodStatus" FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id JOIN staff s ON s.id=pi.staff_id WHERE pi.tenant_id=$1 AND pp.year=$2 AND pp.month=$3 ${branchId?'AND pi.branch_id=$4':''} ORDER BY s."firstName",s."lastName"`,...(branchId?[tenantId,y,m,branchId]:[tenantId,y,m]));
  }

  async createPayrollPeriod(year:number,month:number){const {tenantId}=this.scope(); if(month<1||month>12)throw new BadRequestException('month must be between 1 and 12.'); return this.prisma.$queryRawUnsafe<any[]>(`INSERT INTO payroll_periods(tenant_id,year,month,status) VALUES($1,$2,$3,'DRAFT') ON CONFLICT(tenant_id,year,month) DO UPDATE SET updated_at=CURRENT_TIMESTAMP RETURNING *`,tenantId,year,month);}

  async payments(year?:number,month?:number){const {tenantId,branchId}=this.scope();const y=year??new Date().getFullYear();const m=month??new Date().getMonth()+1;return this.prisma.$queryRawUnsafe<any[]>(`SELECT sp.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM salary_payments sp JOIN payroll_periods pp ON pp.id=sp.period_id JOIN staff s ON s.id=sp.staff_id WHERE sp.tenant_id=$1 AND pp.year=$2 AND pp.month=$3 ${branchId?'AND sp.branch_id=$4':''} ORDER BY s."firstName",s."lastName"`,...(branchId?[tenantId,y,m,branchId]:[tenantId,y,m]));}

  async sgk(year?:number,month?:number){const {tenantId,branchId}=this.scope();const y=year??new Date().getFullYear();const m=month??new Date().getMonth()+1;return this.prisma.$queryRawUnsafe<any[]>(`SELECT sr.*,s."firstName" AS "firstName",s."lastName" AS "lastName" FROM sgk_records sr JOIN staff s ON s.id=sr.staff_id WHERE sr.tenant_id=$1 AND sr.period_year=$2 AND sr.period_month=$3 ${branchId?'AND sr.branch_id=$4':''} ORDER BY sr.record_date DESC`,...(branchId?[tenantId,y,m,branchId]:[tenantId,y,m]));}
}
