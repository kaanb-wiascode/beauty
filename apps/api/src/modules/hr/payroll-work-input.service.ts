import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class PayrollWorkInputService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}
  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private bounds(year:number,month:number){
    if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<1||month>12) throw new BadRequestException('Valid payroll year and month are required.');
    const start=`${year}-${String(month).padStart(2,'0')}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    return{start,end};
  }

  async preview(year:number,month:number){
    const {tenantId,companyId,branchId}=this.context(); const {start,end}=this.bounds(year,month);
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id AS "staffId",s."firstName",s."lastName",s."branchId" AS "branchId",
              COALESCE((s.profile->>'salary')::numeric,0) AS "configuredGrossSalary",
              COALESCE(a."workedMinutes",0)::int AS "workedMinutes",COALESCE(a."overtimeMinutes",0)::int AS "overtimeMinutes",
              COALESCE(a."presentDays",0)::int AS "presentDays",COALESCE(a."absentDays",0)::int AS "absentDays",
              COALESCE(l."approvedLeaveRecords",0)::int AS "approvedLeaveRecords",COALESCE(l."declaredLeaveDays",0)::numeric AS "declaredLeaveDays",
              COALESCE(l."unpaidLeaveRecords",0)::int AS "unpaidLeaveRecords"
       FROM staff s JOIN branches b ON b.id=s."branchId"
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ar.worked_minutes),0) AS "workedMinutes",COALESCE(SUM(ar.overtime_minutes),0) AS "overtimeMinutes",
                COUNT(*) FILTER(WHERE ar.status='PRESENT') AS "presentDays",COUNT(*) FILTER(WHERE ar.status='ABSENT') AS "absentDays"
         FROM attendance_records ar WHERE ar.staff_id=s.id AND ar.tenant_id=$1::text AND ar.work_date BETWEEN $4::date AND $5::date
       ) a ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER(WHERE lr.status='APPROVED') AS "approvedLeaveRecords",
                COALESCE(SUM(lr.days) FILTER(WHERE lr.status='APPROVED'),0) AS "declaredLeaveDays",
                COUNT(*) FILTER(WHERE lr.status='APPROVED' AND lr.type='UNPAID') AS "unpaidLeaveRecords"
         FROM leave_requests lr WHERE lr.staff_id=s.id AND lr.tenant_id=$1::text AND lr.start_date <= $5::date AND lr.end_date >= $4::date
       ) l ON true
       WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE'
         AND ($3::text IS NULL OR s."branchId"=$3::text)
       ORDER BY s."firstName",s."lastName"`,tenantId,companyId,branchId,start,end);
    return{year,month,period:{start,end},policy:{financialAmountsMutated:false,note:'Attendance and leave are captured as auditable payroll inputs; monetary payroll formulas remain explicit.'},staff:rows};
  }

  async attachToDraft(periodId:string,staffId:string){
    const {tenantId,companyId,branchId}=this.context();
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(`SELECT id,year,month,status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,periodId,tenantId,companyId);
      if(!periods.length) throw new BadRequestException('Draft payroll period is required.'); const period=periods[0];
      const items=await tx.$queryRawUnsafe<any[]>(`SELECT id,branch_id AS "branchId",calculation_snapshot AS "calculationSnapshot" FROM payroll_items WHERE period_id=$1::text AND staff_id=$2::text AND tenant_id=$3::text AND company_id=$4::text AND ($5::text IS NULL OR branch_id=$5::text) FOR UPDATE`,periodId,staffId,tenantId,companyId,branchId);
      if(!items.length) throw new NotFoundException('Draft payroll item not found.');
      const {start,end}=this.bounds(Number(period.year),Number(period.month));
      const stats=await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(ar.worked_minutes),0)::int AS "workedMinutes",COALESCE(SUM(ar.overtime_minutes),0)::int AS "overtimeMinutes",
                COUNT(*) FILTER(WHERE ar.status='PRESENT')::int AS "presentDays",COUNT(*) FILTER(WHERE ar.status='ABSENT')::int AS "absentDays",
                (SELECT COUNT(*)::int FROM leave_requests lr WHERE lr.staff_id=$1::text AND lr.tenant_id=$2::text AND lr.status='APPROVED' AND lr.start_date <= $4::date AND lr.end_date >= $3::date) AS "approvedLeaveRecords",
                (SELECT COALESCE(SUM(lr.days),0)::numeric FROM leave_requests lr WHERE lr.staff_id=$1::text AND lr.tenant_id=$2::text AND lr.status='APPROVED' AND lr.start_date <= $4::date AND lr.end_date >= $3::date) AS "declaredLeaveDays"
         FROM attendance_records ar WHERE ar.staff_id=$1::text AND ar.tenant_id=$2::text AND ar.work_date BETWEEN $3::date AND $4::date`,staffId,tenantId,start,end);
      const existing=items[0].calculationSnapshot&&typeof items[0].calculationSnapshot==='object'?items[0].calculationSnapshot:{};
      const snapshot={...existing,workInputs:{source:'ATTENDANCE_LEAVE',periodStart:start,periodEnd:end,capturedAt:new Date().toISOString(),...stats[0]}};
      await tx.$executeRawUnsafe(`UPDATE payroll_items SET calculation_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1::text`,items[0].id,JSON.stringify(snapshot));
      return{periodId,staffId,workInputs:snapshot.workInputs};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
