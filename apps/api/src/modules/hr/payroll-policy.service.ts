import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export type PayrollPolicyInput = {
  enabled: boolean;
  applyOvertime: boolean;
  applyUnpaidLeaveDeduction: boolean;
  standardMonthlyMinutes?: number | null;
  overtimeMultiplier?: number | null;
  monthlyDayDivisor?: number | null;
};

@Injectable()
export class PayrollPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private context(){return{tenantId:this.tenant.getTenantId(),companyId:this.tenant.getCompanyId(),branchId:this.tenant.getBranchId()};}
  private round(v:number){return Math.round((v+Number.EPSILON)*100)/100;}
  private bounds(year:number,month:number){
    if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<1||month>12) throw new BadRequestException('Valid payroll year and month are required.');
    const start=`${year}-${String(month).padStart(2,'0')}-01`;
    const end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    return{start,end};
  }

  private validate(input:PayrollPolicyInput){
    const standard=input.standardMonthlyMinutes==null?null:Number(input.standardMonthlyMinutes);
    const multiplier=input.overtimeMultiplier==null?null:Number(input.overtimeMultiplier);
    const divisor=input.monthlyDayDivisor==null?null:Number(input.monthlyDayDivisor);
    if(input.applyOvertime&&(!Number.isFinite(standard)||Number(standard)<=0)) throw new BadRequestException('standardMonthlyMinutes is required when overtime policy is enabled.');
    if(input.applyOvertime&&(!Number.isFinite(multiplier)||Number(multiplier)<0)) throw new BadRequestException('overtimeMultiplier is required when overtime policy is enabled.');
    if(input.applyUnpaidLeaveDeduction&&(!Number.isFinite(divisor)||Number(divisor)<=0)) throw new BadRequestException('monthlyDayDivisor is required when unpaid leave deduction is enabled.');
    return {standardMonthlyMinutes:standard,overtimeMultiplier:multiplier,monthlyDayDivisor:divisor};
  }

  async getSettings(){
    const {tenantId,companyId}=this.context();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT enabled,apply_overtime AS "applyOvertime",apply_unpaid_leave_deduction AS "applyUnpaidLeaveDeduction",
              standard_monthly_minutes AS "standardMonthlyMinutes",overtime_multiplier AS "overtimeMultiplier",
              monthly_day_divisor AS "monthlyDayDivisor",updated_at AS "updatedAt"
       FROM payroll_policy_settings WHERE tenant_id=$1::text AND company_id=$2::text LIMIT 1`,tenantId,companyId);
    return rows[0]??{enabled:false,applyOvertime:false,applyUnpaidLeaveDeduction:false,standardMonthlyMinutes:null,overtimeMultiplier:null,monthlyDayDivisor:null,updatedAt:null};
  }

  async updateSettings(input:PayrollPolicyInput,userId:string){
    const {tenantId,companyId}=this.context(); const v=this.validate(input);
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO payroll_policy_settings(tenant_id,company_id,enabled,apply_overtime,apply_unpaid_leave_deduction,standard_monthly_minutes,overtime_multiplier,monthly_day_divisor,updated_by_user_id)
       VALUES($1::text,$2::text,$3,$4,$5,$6,$7,$8,$9::text)
       ON CONFLICT(tenant_id,company_id) DO UPDATE SET enabled=EXCLUDED.enabled,apply_overtime=EXCLUDED.apply_overtime,
         apply_unpaid_leave_deduction=EXCLUDED.apply_unpaid_leave_deduction,standard_monthly_minutes=EXCLUDED.standard_monthly_minutes,
         overtime_multiplier=EXCLUDED.overtime_multiplier,monthly_day_divisor=EXCLUDED.monthly_day_divisor,
         updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=NOW()
       RETURNING enabled,apply_overtime AS "applyOvertime",apply_unpaid_leave_deduction AS "applyUnpaidLeaveDeduction",
         standard_monthly_minutes AS "standardMonthlyMinutes",overtime_multiplier AS "overtimeMultiplier",monthly_day_divisor AS "monthlyDayDivisor",updated_at AS "updatedAt"`,
      tenantId,companyId,Boolean(input.enabled),Boolean(input.applyOvertime),Boolean(input.applyUnpaidLeaveDeduction),v.standardMonthlyMinutes,v.overtimeMultiplier,v.monthlyDayDivisor,userId);
    return rows[0];
  }

  private calculate(baseGrossInput:number,overtimeMinutesInput:number,unpaidLeaveDaysInput:number,settings:any){
    const baseGross=this.round(Number(baseGrossInput)||0); const overtimeMinutes=Math.max(0,Number(overtimeMinutesInput)||0); const unpaidLeaveDays=Math.max(0,Number(unpaidLeaveDaysInput)||0);
    if(!settings.enabled) return {baseGross,overtimeAddition:0,unpaidLeaveDeduction:0,proposedGross:baseGross,delta:0,policyApplied:false};
    let overtimeAddition=0,unpaidLeaveDeduction=0;
    if(settings.applyOvertime){
      const standard=Number(settings.standardMonthlyMinutes); const multiplier=Number(settings.overtimeMultiplier);
      if(standard>0&&multiplier>=0) overtimeAddition=this.round((baseGross/standard)*overtimeMinutes*multiplier);
    }
    if(settings.applyUnpaidLeaveDeduction){
      const divisor=Number(settings.monthlyDayDivisor);
      if(divisor>0) unpaidLeaveDeduction=this.round((baseGross/divisor)*unpaidLeaveDays);
    }
    const proposedGross=this.round(Math.max(0,baseGross+overtimeAddition-unpaidLeaveDeduction));
    return {baseGross,overtimeAddition,unpaidLeaveDeduction,proposedGross,delta:this.round(proposedGross-baseGross),policyApplied:true};
  }

  async preview(year:number,month:number){
    const {tenantId,companyId,branchId}=this.context(); const {start,end}=this.bounds(year,month); const settings=await this.getSettings();
    const rows=await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id AS "staffId",s."firstName",s."lastName",s."branchId" AS "branchId",
              COALESCE((s.profile->>'salary')::numeric,0) AS "configuredGrossSalary",
              COALESCE((SELECT SUM(ar.overtime_minutes) FROM attendance_records ar WHERE ar.staff_id=s.id AND ar.tenant_id=$1::text AND ar.work_date BETWEEN $4::date AND $5::date),0)::numeric AS "overtimeMinutes",
              COALESCE((SELECT SUM(LEAST(lr.days, GREATEST(0,(LEAST(lr.end_date,$5::date)-GREATEST(lr.start_date,$4::date)+1))::numeric))
                        FROM leave_requests lr WHERE lr.staff_id=s.id AND lr.tenant_id=$1::text AND lr.status='APPROVED' AND lr.type='UNPAID'
                          AND lr.start_date <= $5::date AND lr.end_date >= $4::date),0)::numeric AS "unpaidLeaveDays"
       FROM staff s JOIN branches b ON b.id=s."branchId"
       WHERE s."tenantId"=$1::text AND b."companyId"=$2::text AND s.status='ACTIVE' AND ($3::text IS NULL OR s."branchId"=$3::text)
       ORDER BY s."firstName",s."lastName"`,tenantId,companyId,branchId,start,end);
    return {year,month,period:{start,end},settings,staff:rows.map(row=>({...row,...this.calculate(Number(row.configuredGrossSalary),Number(row.overtimeMinutes),Number(row.unpaidLeaveDays),settings)}))};
  }

  async attachEvaluation(periodId:string,staffId:string){
    const {tenantId,companyId,branchId}=this.context(); const settings=await this.getSettings();
    return this.prisma.$transaction(async tx=>{
      const periods=await tx.$queryRawUnsafe<any[]>(`SELECT id,year,month,status FROM payroll_periods WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT' FOR UPDATE`,periodId,tenantId,companyId);
      if(!periods.length) throw new BadRequestException('Draft payroll period is required.'); const p=periods[0]; const {start,end}=this.bounds(Number(p.year),Number(p.month));
      const items=await tx.$queryRawUnsafe<any[]>(`SELECT id,branch_id AS "branchId",gross_amount AS "grossAmount",calculation_snapshot AS "calculationSnapshot" FROM payroll_items WHERE period_id=$1::text AND staff_id=$2::text AND tenant_id=$3::text AND company_id=$4::text AND ($5::text IS NULL OR branch_id=$5::text) FOR UPDATE`,periodId,staffId,tenantId,companyId,branchId);
      if(!items.length) throw new NotFoundException('Draft payroll item not found.');
      const staff=await tx.$queryRawUnsafe<any[]>(`SELECT COALESCE((profile->>'salary')::numeric,0) AS "configuredGrossSalary" FROM staff WHERE id=$1::text AND "tenantId"=$2::text LIMIT 1`,staffId,tenantId);
      if(!staff.length) throw new NotFoundException('Staff member not found.');
      const stats=await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE((SELECT SUM(ar.overtime_minutes) FROM attendance_records ar WHERE ar.staff_id=$1::text AND ar.tenant_id=$2::text AND ar.work_date BETWEEN $3::date AND $4::date),0)::numeric AS "overtimeMinutes",
                COALESCE((SELECT SUM(LEAST(lr.days, GREATEST(0,(LEAST(lr.end_date,$4::date)-GREATEST(lr.start_date,$3::date)+1))::numeric)) FROM leave_requests lr
                  WHERE lr.staff_id=$1::text AND lr.tenant_id=$2::text AND lr.status='APPROVED' AND lr.type='UNPAID' AND lr.start_date <= $4::date AND lr.end_date >= $3::date),0)::numeric AS "unpaidLeaveDays"`,staffId,tenantId,start,end);
      const result=this.calculate(Number(staff[0].configuredGrossSalary),Number(stats[0]?.overtimeMinutes),Number(stats[0]?.unpaidLeaveDays),settings);
      const existing=items[0].calculationSnapshot&&typeof items[0].calculationSnapshot==='object'?items[0].calculationSnapshot:{};
      const evaluation={source:'PAYROLL_POLICY',capturedAt:new Date().toISOString(),periodStart:start,periodEnd:end,settings,inputs:{configuredGrossSalary:Number(staff[0].configuredGrossSalary),overtimeMinutes:Number(stats[0]?.overtimeMinutes??0),unpaidLeaveDays:Number(stats[0]?.unpaidLeaveDays??0)},...result,enteredGross:this.round(Number(items[0].grossAmount)),grossVariance:this.round(Number(items[0].grossAmount)-result.proposedGross)};
      await tx.$executeRawUnsafe(`UPDATE payroll_items SET calculation_snapshot=$2::jsonb,updated_at=NOW() WHERE id=$1::text`,items[0].id,JSON.stringify({...existing,policyEvaluation:evaluation}));
      return {periodId,staffId,evaluation};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
}
