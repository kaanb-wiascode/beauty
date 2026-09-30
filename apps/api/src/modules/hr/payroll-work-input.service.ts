import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

@Injectable()
export class PayrollWorkInputService {
  constructor(private readonly prisma: PrismaService,private readonly tenant: TenantContext,private readonly organizationScope: OrganizationScopeService) {}
  private async context(){const tenantId=this.tenant.getTenantId();const companyId=this.tenant.getCompanyId();const activeBranchId=this.tenant.getBranchId();const scope=await this.organizationScope.getBranchScopedWhere();const branchIds='branchId'in scope?(typeof scope.branchId==='string'?[scope.branchId]:scope.branchId.in):null;return{tenantId,companyId,activeBranchId,branchIds}}
  private bounds(year:number,month:number){if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<1||month>12)throw new BadRequestException('Valid payroll year and month are required.');const start=`${year}-${String(month).padStart(2,'0')}-01`;const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);return{start,end}}
  async preview(year:number,month:number){const {tenantId,companyId,branchIds}=await this.context();const {start,end}=this.bounds(year,month);const rows=await this.prisma.$queryRawUnsafe<any[]>(`SELECT s.id AS "staffId",s."firstName",s."lastName",s."branchId" AS "branchId",COALESCE((s.profile->>'salary')::numeric,0) AS "configuredGrossSalary",COALESCE(a."workedMinutes",0)::int AS "workedMinutes",COALESCE(a."overtimeMinutes",0)::int AS "overtimeMinutes",COALESCE(a."approvedOvertimeMinutes",0)::int AS "approvedOvertimeMinutes",COALESCE(a."presentDays",0)::int AS "presentDays",COALESCE(a."absentDays",0)::int AS "absentDays",COALESCE(l."approvedLeaveRecords",0)::int AS "approvedLeaveRecords",COALESCE(l."declaredLeaveDays",0)::numeric AS "declaredLeaveDays",COALESCE(l."unpaidLeaveRecords",0)::int AS "unpaidLeaveRecords" FROM staff s JOIN branches b ON b.id=s."branchId" LEFT JOIN LATERAL (SELECT COALESCE(SUM(ar.worked_minutes),0) AS "workedMinutes",COALESCE(SUM(ar.overtime_minutes),0) AS "overtimeMinutes",COALESCE(SUM(ar.approved_overtime_minutes),0) AS "approvedOvertimeMinutes",COUNT(*) FILTER(WHERE ar.status='PRESENT') AS "presentDays",COUNT(*) FILTER(WHERE ar.status='ABSENT') AS "absentDays" FROM attendance_records ar WHERE ar.staff_id=s.id AND ar.tenant_id=$1::text AND ar.work_date BETWEEN $4::date AND $5::date) a ON true LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE lr.status='APPROVED') AS "approvedLeaveRecords",COALESCE(SUM(lr.days) FILTER(WHERE lr.status='APPROVED'),0) AS "declaredLeaveDays",COUNT(*) FILTER(WHERE lr.status='APPROVED' AND lr.type='UNPAID') AS "unpaidLeaveRecords" FROM leave_requests lr WHERE lr.staff_id=s.id AND lr.tenant_id=$1::text AND lr.start_date <= $5::date AND lr.end_date >= $4::date) l ON true WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE' AND ($3::text[] IS NULL OR s."branchId"=ANY($3::text[])) ORDER BY s."firstName",s."lastName"`,tenantId,companyId,branchIds,start,end);return{year,month,period:{start,end},policy:{financialAmountsMutated:false,note:'Attendance, approved overtime and leave are captured as auditable payroll inputs; monetary payroll formulas remain explicit.'},staff:rows}}
  async closeMonth(year:number,month:number,userId:string){
    const {tenantId,companyId,activeBranchId,branchIds}=await this.context();
    const {start,end}=this.bounds(year,month);
    if(!activeBranchId) throw new BadRequestException('Puantaj kapanışı için aktif şube seçilmelidir.');
    if(branchIds!==null&&!branchIds.includes(activeBranchId)) throw new NotFoundException('Aktif şube organizasyon kapsamı dışında.');

    return this.prisma.$transaction(async tx=>{
      const branches=await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM branches WHERE id=$1::text AND "companyId"=$2::text AND status='ACTIVE' LIMIT 1`,
        activeBranchId,
        companyId,
      );
      if(!branches.length) throw new NotFoundException('Aktif şube bulunamadı.');

      const existing=await tx.$queryRawUnsafe<any[]>(
        `SELECT id,payroll_period_id AS "payrollPeriodId",year,month,period_start AS "periodStart",period_end AS "periodEnd",status,staff_count AS "staffCount",attendance_record_count AS "attendanceRecordCount",open_exception_count AS "openExceptionCount",snapshot,closed_at AS "closedAt"
         FROM hr_attendance_period_closures
         WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text AND year=$4 AND month=$5
         LIMIT 1 FOR UPDATE`,
        tenantId,companyId,activeBranchId,year,month,
      );
      if(existing.length) return {...existing[0],duplicate:true};

      const closable=await tx.$queryRawUnsafe<Array<{ok:boolean}>>(
        `SELECT CURRENT_DATE > $1::date AS ok`,
        end,
      );
      if(!closable[0]?.ok) throw new BadRequestException('Puantaj dönemi, ilgili ay tamamlanmadan kapatılamaz.');

      const exceptionRows=await tx.$queryRawUnsafe<Array<{count:number}>>(
        `SELECT COUNT(*)::int AS count
         FROM attendance_records
         WHERE tenant_id=$1::text AND branch_id=$2::text
           AND work_date BETWEEN $3::date AND $4::date
           AND exception_status='OPEN'`,
        tenantId,activeBranchId,start,end,
      );
      const openExceptionCount=Number(exceptionRows[0]?.count??0);
      if(openExceptionCount>0) throw new BadRequestException(`Puantaj kapanışı yapılamadı: ${openExceptionCount} açık puantaj istisnası bulunuyor.`);

      const pendingRows=await tx.$queryRawUnsafe<Array<{count:number}>>(
        `SELECT COUNT(DISTINCT r.id)::int AS count
         FROM approval_requests r
         JOIN hr_attendance_corrections c ON c.id=r."entityId"
         JOIN attendance_records a ON a.id=c.attendance_record_id
         WHERE r."tenantId"=$1::text AND r."companyId"=$2::text
           AND r."entityType"='hr_attendance_correction'
           AND r.status NOT IN('APPROVED','REJECTED','CANCELLED')
           AND a.tenant_id=$1::text AND a.branch_id=$3::text
           AND a.work_date BETWEEN $4::date AND $5::date`,
        tenantId,companyId,activeBranchId,start,end,
      );
      const pendingCorrectionCount=Number(pendingRows[0]?.count??0);
      if(pendingCorrectionCount>0) throw new BadRequestException(`Puantaj kapanışı yapılamadı: ${pendingCorrectionCount} sonuçlanmamış düzeltme talebi bulunuyor.`);

      const staff=await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id AS "staffId",s."firstName",s."lastName",
                COALESCE(a."workedMinutes",0)::int AS "workedMinutes",
                COALESCE(a."overtimeMinutes",0)::int AS "overtimeMinutes",
                COALESCE(a."approvedOvertimeMinutes",0)::int AS "approvedOvertimeMinutes",
                COALESCE(a."presentDays",0)::int AS "presentDays",
                COALESCE(a."absentDays",0)::int AS "absentDays",
                COALESCE(l."approvedLeaveRecords",0)::int AS "approvedLeaveRecords",
                COALESCE(l."declaredLeaveDays",0)::numeric AS "declaredLeaveDays",
                COALESCE(l."unpaidLeaveRecords",0)::int AS "unpaidLeaveRecords"
         FROM staff s
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(ar.worked_minutes),0) AS "workedMinutes",
                  COALESCE(SUM(ar.overtime_minutes),0) AS "overtimeMinutes",
                  COALESCE(SUM(ar.approved_overtime_minutes),0) AS "approvedOvertimeMinutes",
                  COUNT(*) FILTER(WHERE ar.status='PRESENT') AS "presentDays",
                  COUNT(*) FILTER(WHERE ar.status='ABSENT') AS "absentDays"
           FROM attendance_records ar
           WHERE ar.staff_id=s.id AND ar.tenant_id=$1::text AND ar.branch_id=$3::text
             AND ar.work_date BETWEEN $4::date AND $5::date
         ) a ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER(WHERE lr.status='APPROVED') AS "approvedLeaveRecords",
                  COALESCE(SUM(lr.days) FILTER(WHERE lr.status='APPROVED'),0) AS "declaredLeaveDays",
                  COUNT(*) FILTER(WHERE lr.status='APPROVED' AND lr.type='UNPAID') AS "unpaidLeaveRecords"
           FROM leave_requests lr
           WHERE lr.staff_id=s.id AND lr.tenant_id=$1::text AND lr.branch_id=$3::text
             AND lr.start_date <= $5::date AND lr.end_date >= $4::date
         ) l ON true
         WHERE s."tenantId"=$1::text AND s."branchId"=$3::text AND s.status='ACTIVE'
         ORDER BY s."firstName",s."lastName"`,
        tenantId,companyId,activeBranchId,start,end,
      );

      const attendanceRows=await tx.$queryRawUnsafe<Array<{count:number}>>(
        `SELECT COUNT(*)::int AS count FROM attendance_records
         WHERE tenant_id=$1::text AND branch_id=$2::text AND work_date BETWEEN $3::date AND $4::date`,
        tenantId,activeBranchId,start,end,
      );

      const periods=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO payroll_periods(tenant_id,company_id,branch_id,year,month,status)
         VALUES($1::text,$2::text,$3::text,$4,$5,'DRAFT')
         ON CONFLICT(tenant_id,year,month)
         DO UPDATE SET company_id=COALESCE(payroll_periods.company_id,EXCLUDED.company_id),
                       branch_id=CASE WHEN payroll_periods.branch_id IS NULL THEN EXCLUDED.branch_id ELSE payroll_periods.branch_id END,
                       updated_at=NOW()
         RETURNING id,branch_id AS "branchId",status`,
        tenantId,companyId,activeBranchId,year,month,
      );
      const period=periods[0];
      if(period.branchId!==activeBranchId) throw new BadRequestException('Bu ay için başka bir şubeye bağlı bordro dönemi bulunuyor.');
      if(period.status!=='DRAFT') throw new BadRequestException('Puantaj kapanışı yalnız taslak bordro dönemine bağlanabilir.');

      const snapshot={
        source:'ATTENDANCE_PERIOD_CLOSE',
        periodStart:start,
        periodEnd:end,
        branchId:activeBranchId,
        capturedAt:new Date().toISOString(),
        pendingCorrectionCount,
        staff,
      };
      const rows=await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO hr_attendance_period_closures(
           tenant_id,company_id,branch_id,payroll_period_id,year,month,period_start,period_end,status,
           staff_count,attendance_record_count,open_exception_count,snapshot,closed_by_user_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7::date,$8::date,'CLOSED',$9,$10,$11,$12::jsonb,$13::text)
         RETURNING id,payroll_period_id AS "payrollPeriodId",year,month,period_start AS "periodStart",period_end AS "periodEnd",status,staff_count AS "staffCount",attendance_record_count AS "attendanceRecordCount",open_exception_count AS "openExceptionCount",closed_at AS "closedAt"`,
        tenantId,companyId,activeBranchId,period.id,year,month,start,end,staff.length,
        Number(attendanceRows[0]?.count??0),openExceptionCount,JSON.stringify(snapshot),userId,
      );
      return {...rows[0],pendingCorrectionCount,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async attachToDraft(periodId:string,staffId:string){const {tenantId,companyId,branchIds}=await this.context();return this.prisma.$transaction(async tx=>{const periods=await tx.$queryRawUnsafe<any[]>(`SELECT id,year,month,status,branch_id AS "branchId" FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,periodId,tenantId,companyId);if(!periods.length)throw new BadRequestException('Draft payroll period is required.');const period=periods[0];if(branchIds!==null&&period.branchId!==null&&!branchIds.includes(period.branchId))throw new NotFoundException('Draft payroll period not found.');const items=await tx.$queryRawUnsafe<any[]>(`SELECT id,branch_id AS "branchId",calculation_snapshot AS "calculationSnapshot" FROM payroll_items WHERE period_id=$1::text AND staff_id=$2::text AND tenant_id=$3::text AND company_id=$4::text AND ($5::text[] IS NULL OR branch_id=ANY($5::text[])) FOR UPDATE`,periodId,staffId,tenantId,companyId,branchIds);if(!items.length)throw new NotFoundException('Draft payroll item not found.');const {start,end}=this.bounds(Number(period.year),Number(period.month));const stats=await tx.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(ar.worked_minutes),0)::int AS "workedMinutes",COALESCE(SUM(ar.overtime_minutes),0)::int AS "overtimeMinutes",COALESCE(SUM(ar.approved_overtime_minutes),0)::int AS "approvedOvertimeMinutes",COUNT(*) FILTER(WHERE ar.status='PRESENT')::int AS "presentDays",COUNT(*) FILTER(WHERE ar.status='ABSENT')::int AS "absentDays",(SELECT COUNT(*)::int FROM leave_requests lr WHERE lr.staff_id=$1::text AND lr.tenant_id=$2::text AND lr.status='APPROVED' AND lr.start_date <= $4::date AND lr.end_date >= $3::date AND ($5::text[] IS NULL OR lr.branch_id=ANY($5::text[]))) AS "approvedLeaveRecords",(SELECT COALESCE(SUM(lr.days),0)::numeric FROM leave_requests lr WHERE lr.staff_id=$1::text AND lr.tenant_id=$2::text AND lr.status='APPROVED' AND lr.start_date <= $4::date AND lr.end_date >= $3::date AND ($5::text[] IS NULL OR lr.branch_id=ANY($5::text[]))) AS "declaredLeaveDays" FROM attendance_records ar WHERE ar.staff_id=$1::text AND ar.tenant_id=$2::text AND ar.work_date BETWEEN $3::date AND $4::date AND ($5::text[] IS NULL OR ar.branch_id=ANY($5::text[]))`,staffId,tenantId,start,end,branchIds);const existing=items[0].calculationSnapshot&&typeof items[0].calculationSnapshot==='object'?items[0].calculationSnapshot:{};const snapshot={...existing,workInputs:{source:'ATTENDANCE_LEAVE_OVERTIME',periodStart:start,periodEnd:end,capturedAt:new Date().toISOString(),...stats[0]}};await tx.$executeRawUnsafe(`UPDATE payroll_items SET calculation_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1::text`,items[0].id,JSON.stringify(snapshot));return{periodId,staffId,workInputs:snapshot.workInputs}}, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}
}
