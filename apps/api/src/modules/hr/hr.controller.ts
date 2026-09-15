import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { HrService } from './hr.service';
import { HrOrganizationService } from './hr-organization.service';
import { Employee360Service } from './employee-360.service';
import { PayrollAccountingService } from './payroll-accounting.service';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollSettlementService } from './payroll-settlement.service';
import { PayrollReportService } from './payroll-report.service';
import { PayrollPostingOrchestratorService } from './payroll-posting-orchestrator.service';
import { PayrollReversalService } from './payroll-reversal.service';
import { PayrollDashboardService } from './payroll-dashboard.service';
import { PayrollPaymentReversalService } from './payroll-payment-reversal.service';
import { PayrollWorkInputService } from './payroll-work-input.service';
import { HrAnalyticsService } from './hr-analytics.service';
import { PayrollPolicyService } from './payroll-policy.service';

@Controller('hr')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('hr', 'read')
export class HrController {
  constructor(private readonly hrService:HrService,private readonly organization:HrOrganizationService,private readonly employee360:Employee360Service,private readonly payrollAccounting:PayrollAccountingService,private readonly payrollPeriods:PayrollPeriodService,private readonly payrollSettlement:PayrollSettlementService,private readonly payrollReport:PayrollReportService,private readonly payrollPosting:PayrollPostingOrchestratorService,private readonly payrollReversal:PayrollReversalService,private readonly payrollDashboard:PayrollDashboardService,private readonly paymentReversal:PayrollPaymentReversalService,private readonly payrollWorkInputs:PayrollWorkInputService,private readonly hrAnalytics:HrAnalyticsService,private readonly payrollPolicy:PayrollPolicyService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
  @Get('employees') employees(){return this.hrService.employees();}
  @Post('employees') @RequirePermission('hr','manage') createEmployee(@Body()b:any){return this.hrService.createEmployee(b);}
  @Get('employees/:id/360') employeeOverview(@Param('id')id:string){return this.employee360.get(id);}
  @Patch('employees/:id') @RequirePermission('hr','manage') updateEmployee(@Param('id')id:string,@Body()b:any){return this.hrService.updateEmployee(id,b);}
  @Delete('employees/:id') @RequirePermission('hr','manage') deleteEmployee(@Param('id')id:string){return this.hrService.deleteEmployee(id);}
  @Get('organization') organizationStructure(){return this.organization.structure();}
  @Post('organization/departments') @RequirePermission('hr','manage') createDepartment(@Body()b:any){return this.organization.createDepartment(b);}
  @Post('organization/teams') @RequirePermission('hr','manage') createTeam(@Body()b:any){return this.organization.createTeam(b);}
  @Post('organization/positions') @RequirePermission('hr','manage') createPosition(@Body()b:any){return this.organization.createPosition(b);}
  @Get('employees/:id/assignments') employeeAssignments(@Param('id')id:string){return this.organization.employeeHistory(id);}
  @Post('employees/:id/assignments') @RequirePermission('hr','manage') assignEmployee(@Param('id')id:string,@Body()b:any){return this.organization.assign(id,b);}
  @Get('personnel-files') personnelFiles(){return this.hrService.personnelFiles();}
  @Get('attendance') attendance(@Query('year')y?:string,@Query('month')m?:string){return this.hrService.attendance(y?+y:undefined,m?+m:undefined);}
  @Post('attendance') @RequirePermission('hr','manage') saveAttendance(@Body()b:any){return this.hrService.upsertAttendance(b);}
  @Get('leaves') leaves(){return this.hrService.leaves();}
  @Post('leaves') @RequirePermission('hr','manage') createLeave(@Body()b:any){return this.hrService.createLeave(b);}
  @Patch('leaves/:id') @RequirePermission('hr','manage') updateLeave(@Param('id')id:string,@Body()b:any){return this.hrService.updateLeave(id,b);}
  @Delete('leaves/:id') @RequirePermission('hr','manage') deleteLeave(@Param('id')id:string){return this.hrService.deleteLeave(id);}
  @Get('analytics') analytics(@Query('year')y?:string,@Query('month')m?:string){const n=new Date();return this.hrAnalytics.summary(y?+y:n.getFullYear(),m?+m:n.getMonth()+1);}
  @Get('payroll') payroll(@Query('year')y?:string,@Query('month')m?:string){return this.hrService.payroll(y?+y:undefined,m?+m:undefined);}
  @Get('payroll/dashboard') payrollDashboardSummary(@Query('year')y?:string,@Query('month')m?:string){return this.payrollDashboard.summary(y?+y:undefined,m?+m:undefined);}
  @Get('payroll/work-inputs') payrollWorkInputPreview(@Query('year')y:string,@Query('month')m:string){return this.payrollWorkInputs.preview(+y,+m);}
  @Get('payroll/policy') payrollPolicySettings(){return this.payrollPolicy.getSettings();}
  @Put('payroll/policy') @RequirePermission('hr','manage') updatePayrollPolicy(@Body()b:any,@Req()r:{user?:{sub?:string}}){return this.payrollPolicy.updateSettings({enabled:Boolean(b.enabled),applyOvertime:Boolean(b.applyOvertime),applyUnpaidLeaveDeduction:Boolean(b.applyUnpaidLeaveDeduction),standardMonthlyMinutes:b.standardMonthlyMinutes==null?null:Number(b.standardMonthlyMinutes),overtimeMultiplier:b.overtimeMultiplier==null?null:Number(b.overtimeMultiplier),monthlyDayDivisor:b.monthlyDayDivisor==null?null:Number(b.monthlyDayDivisor)},this.userId(r));}
  @Get('payroll/policy/preview') payrollPolicyPreview(@Query('year')y:string,@Query('month')m:string){return this.payrollPolicy.preview(+y,+m);}
  @Post('payroll/periods') @RequirePermission('hr','manage') createPayrollPeriod(@Body()b:{year:number;month:number}){return this.payrollPeriods.create(+b.year,+b.month);}
  @Post('payroll/periods/:id/items') @RequirePermission('hr','manage') upsertPayrollItem(@Param('id')id:string,@Body()b:any){return this.payrollAccounting.upsertItem(id,{staffId:b.staffId,branchId:b.branchId,costCenterId:b.costCenterId,grossAmount:Number(b.grossAmount),netAmount:Number(b.netAmount),incomeTax:Number(b.incomeTax??0),stampTax:Number(b.stampTax??0),employeeSocialSecurity:Number(b.employeeSocialSecurity??0),unemploymentEmployee:Number(b.unemploymentEmployee??0),employerSocialSecurity:Number(b.employerSocialSecurity??0),unemploymentEmployer:Number(b.unemploymentEmployer??0),otherDeductions:Number(b.otherDeductions??0),employerCost:Number(b.employerCost),note:b.note});}
  @Post('payroll/periods/:id/items/:staffId/work-inputs') @RequirePermission('hr','manage') attachPayrollWorkInputs(@Param('id')id:string,@Param('staffId')s:string){return this.payrollWorkInputs.attachToDraft(id,s);}
  @Post('payroll/periods/:id/items/:staffId/policy-evaluation') @RequirePermission('hr','manage') attachPayrollPolicyEvaluation(@Param('id')id:string,@Param('staffId')s:string){return this.payrollPolicy.attachEvaluation(id,s);}
  @Post('payroll/periods/:id/submit') @RequirePermission('hr','manage') submitPayroll(@Param('id')id:string){return this.payrollAccounting.submit(id);}
  @Post('payroll/periods/:id/approve') @RequirePermission('hr','manage') approvePayroll(@Param('id')id:string,@Req()r:{user?:{sub?:string}}){return this.payrollAccounting.approve(id,this.userId(r));}
  @Post('payroll/periods/:id/post') @RequirePermission('hr','manage') postPayroll(@Param('id')id:string){return this.payrollPosting.post(id);}
  @Post('payroll/periods/:id/cancel') @RequirePermission('hr','manage') cancelPayroll(@Param('id')id:string,@Body()b:{reason?:string},@Req()r:{user?:{sub?:string}}){return this.payrollReversal.cancel(id,this.userId(r),b.reason??'');}
  @Post('payroll/periods/:id/reverse') @RequirePermission('hr','manage') reversePayroll(@Param('id')id:string,@Body()b:{reason?:string},@Req()r:{user?:{sub?:string}}){return this.payrollReversal.reverse(id,this.userId(r),b.reason??'');}
  @Get('payroll/periods/:id/report') payrollPeriodReport(@Param('id')id:string){return this.payrollReport.period(id);}
  @Post('payroll/periods/:id/payments') @RequirePermission('hr','manage') paySalary(@Param('id')id:string,@Body()b:any,@Req()r:{user?:{sub?:string}}){return this.payrollSettlement.paySalary(id,b.staffId,Number(b.amount),b.method==='CASH'?'CASH':'BANK',this.userId(r),b.note);}
  @Post('payroll/periods/:id/liabilities') @RequirePermission('hr','manage') settleLiability(@Param('id')id:string,@Body()b:any,@Req()r:{user?:{sub?:string}}){const t=b.type==='TAX'?'TAX':b.type==='SOCIAL_SECURITY'?'SOCIAL_SECURITY':'OTHER';return this.payrollSettlement.settleLiability(id,t,Number(b.amount),b.method==='CASH'?'CASH':'BANK',this.userId(r),b.note);}
  @Post('payroll/payments/:paymentId/reverse') @RequirePermission('hr','manage') reverseSalaryPayment(@Param('paymentId')p:string,@Body()b:{reason?:string},@Req()r:{user?:{sub?:string}}){return this.paymentReversal.reverseSalaryPayment(p,this.userId(r),b.reason??'');}
  @Post('payroll/liability-payments/:paymentId/reverse') @RequirePermission('hr','manage') reverseLiabilityPayment(@Param('paymentId')p:string,@Body()b:{reason?:string},@Req()r:{user?:{sub?:string}}){return this.paymentReversal.reverseLiabilityPayment(p,this.userId(r),b.reason??'');}
  @Get('payments') payments(@Query('year')y?:string,@Query('month')m?:string){return this.hrService.payments(y?+y:undefined,m?+m:undefined);}
  @Post('payments') @RequirePermission('hr','manage') createPayment(@Body()b:any,@Req()r:{user?:{sub?:string}}){if(!b.periodId)throw new BadRequestException('periodId is required for accounting-backed salary payment.');return this.payrollSettlement.paySalary(b.periodId,b.staffId,Number(b.amount),b.method==='CASH'?'CASH':'BANK',this.userId(r),b.note);}
  @Get('sgk') sgk(@Query('year')y?:string,@Query('month')m?:string){return this.hrService.sgk(y?+y:undefined,m?+m:undefined);}
  @Post('sgk') @RequirePermission('hr','manage') createSgk(@Body()b:any){return this.hrService.createSgk(b);}
}
