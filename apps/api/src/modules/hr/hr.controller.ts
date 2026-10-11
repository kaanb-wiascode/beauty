import { BadRequestException,Body,Controller,Delete,Get,Param,Patch,Post,Put,Query,Req,UnauthorizedException,UseGuards } from '@nestjs/common';import{JwtAuthGuard}from'../../common/auth/jwt-auth.guard';import{PermissionsGuard}from'../../common/auth/permissions.guard';import{RequirePermission,RequirePermissions}from'../../common/auth/permissions.decorator';import{TenantAuthGuard}from'../../common/tenant/tenant-auth.guard';import{EmployeeAssetsService}from'./employee-assets.service';import{HrService}from'./hr.service';import{HrOrganizationService}from'./hr-organization.service';import{Employee360Service}from'./employee-360.service';import{EmploymentHistoryService}from'./employment-history.service';import{OnboardingService}from'./onboarding.service';import{ProbationService}from'./probation.service';import{OffboardingService}from'./offboarding.service';import{PayrollAccountingService}from'./payroll-accounting.service';import{PayrollPeriodService}from'./payroll-period.service';import{PayrollSettlementService}from'./payroll-settlement.service';import{PayrollReportService}from'./payroll-report.service';import{PayrollPostingOrchestratorService}from'./payroll-posting-orchestrator.service';import{PayrollReversalService}from'./payroll-reversal.service';import{PayrollDashboardService}from'./payroll-dashboard.service';import{PayrollPaymentReversalService}from'./payroll-payment-reversal.service';import{PayrollWorkInputService}from'./payroll-work-input.service';import{HrAnalyticsService}from'./hr-analytics.service';import{PayrollPolicyService}from'./payroll-policy.service';import{PayrollLegalEngineService}from'./payroll-legal-engine.service';import{SalaryContractService}from'./salary-contract.service';import{PayrollCalculationService}from'./payroll-calculation.service';import{CompensationRequestService}from'./compensation-request.service';
import { createLeaveSchema, updateLeaveSchema, createSgkSchema, payQueueItemSchema, salaryPaymentSchema, legacySalaryPaymentSchema, settleLiabilitySchema, paymentReversalSchema, periodQuerySchema, requiredPeriodQuerySchema, yearQuerySchema, dateQuerySchema, salaryContractSchema, salaryContractEndSchema, assetAssignmentSchema, assetReturnSchema, payrollReversalSchema, netToGrossSchema, taxBaseOpeningSchema, compensationRequestSchema, updateCompensationRequestSchema, employeeCreateSchema, employeeUpdateSchema, employmentHistorySchema, onboardingSchema, onboardingTaskSchema, probationStartSchema, probationReviewSchema, probationDecisionSchema, offboardingSchema, offboardingTaskSchema, createDepartmentSchema, createTeamSchema, createPositionSchema, employeeAssignmentSchema, payrollPolicySchema, payrollLegalVersionSchema } from './dto/hr-records.dto';
@Controller('hr')@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)@RequirePermission('hr','read')export class HrController{constructor(private readonly hrService:HrService,private readonly employeeAssets:EmployeeAssetsService,private readonly organization:HrOrganizationService,private readonly employee360:Employee360Service,private readonly employmentHistory:EmploymentHistoryService,private readonly onboarding:OnboardingService,private readonly probation:ProbationService,private readonly offboarding:OffboardingService,private readonly payrollAccounting:PayrollAccountingService,private readonly payrollPeriods:PayrollPeriodService,private readonly payrollSettlement:PayrollSettlementService,private readonly payrollReport:PayrollReportService,private readonly payrollPosting:PayrollPostingOrchestratorService,private readonly payrollReversal:PayrollReversalService,private readonly payrollDashboard:PayrollDashboardService,private readonly paymentReversal:PayrollPaymentReversalService,private readonly payrollWorkInputs:PayrollWorkInputService,private readonly hrAnalytics:HrAnalyticsService,private readonly payrollPolicy:PayrollPolicyService,private readonly payrollLegalEngine:PayrollLegalEngineService,private readonly salaryContracts:SalaryContractService,private readonly payrollCalculation:PayrollCalculationService,private readonly compensationRequests:CompensationRequestService){}private userId(r:{user?:{sub?:string}}){const id=r.user?.sub;if(!id)throw new UnauthorizedException('Oturum açmış kullanıcı kimliği bulunamadı.');return id}
@Get('compensation-requests')@RequirePermission('hr','read')compensationRequestList(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.compensationRequests.list(period.year, period.month);
}@Post('compensation-requests')@RequirePermission('hr','create')createCompensationRequest(@Body() body: unknown, @Req() request: any) {
  return this.compensationRequests.create(compensationRequestSchema.parse(body), this.userId(request));
}@Patch('compensation-requests/:id')@RequirePermission('hr','update')updateReturnedCompensationRequest(
  @Param('id') id: string, @Body() body: unknown, @Req() request: any,
) {
  return this.compensationRequests.updateReturned(
    id, updateCompensationRequestSchema.parse(body), this.userId(request),
  );
}
@Get('employee-provisioning/roles')employeeProvisioningRoles(){return this.hrService.employeeProvisioningRoles()}
@Get('employees')employees(){return this.hrService.employees()}@Get('employees/sensitive')@RequirePermissions({resource:'hr_sensitive',action:'read'})sensitiveEmployees(){return this.hrService.employees(true)}@Post('employees')@RequirePermission('hr','create')createEmployee(@Body() body: unknown) {
  return this.hrService.createEmployee(employeeCreateSchema.parse(body));
}@Get('employees/:id/360')employeeOverview(@Param('id')id:string){return this.employee360.get(id)}@Get('employees/:id/360/sensitive')@RequirePermissions({resource:'hr_sensitive',action:'read'})employeeSensitiveOverview(@Param('id')id:string){return this.employee360.get(id,true)}@Get('employees/:id/employment-history')history(@Param('id')id:string){return this.employmentHistory.list(id)}@Post('employees/:id/employment-history')@RequirePermission('hr','create')recordHistory(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.employmentHistory.record(id, employmentHistorySchema.parse(body), this.userId(request));
}@Get('employees/:id/onboarding')getOnboarding(@Param('id')id:string){return this.onboarding.get(id)}@Post('employees/:id/onboarding')@RequirePermission('hr','create')createOnboarding(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.onboarding.create(id, onboardingSchema.parse(body), this.userId(request));
}@Patch('employees/:id/onboarding/tasks/:taskId')@RequirePermission('hr','update')updateOnboardingTask(
  @Param('id') id: string, @Param('taskId') taskId: string,
  @Body() body: unknown, @Req() request: any,
) {
  return this.onboarding.updateTask(id, taskId, onboardingTaskSchema.parse(body), this.userId(request));
}@Get('employees/:id/probation')getProbation(@Param('id')id:string){return this.probation.get(id)}@Post('employees/:id/probation')@RequirePermission('hr','create')startProbation(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.probation.start(id, probationStartSchema.parse(body), this.userId(request));
}@Patch('employees/:id/probation/reviews/:reviewId')@RequirePermission('hr','update')reviewProbation(
  @Param('id') id: string, @Param('reviewId') reviewId: string,
  @Body() body: unknown, @Req() request: any,
) {
  return this.probation.review(id, reviewId, probationReviewSchema.parse(body), this.userId(request));
}@Post('employees/:id/probation/decision')@RequirePermission('hr','update')decideProbation(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.probation.decide(id, probationDecisionSchema.parse(body), this.userId(request));
}@Get('employees/:id/offboarding')getOffboarding(@Param('id')id:string){return this.offboarding.get(id)}@Post('employees/:id/offboarding')@RequirePermission('hr','create')startOffboarding(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.offboarding.start(id, offboardingSchema.parse(body), this.userId(request));
}@Patch('employees/:id/offboarding/tasks/:taskId')@RequirePermission('hr','update')updateOffboardingTask(
  @Param('id') id: string, @Param('taskId') taskId: string,
  @Body() body: unknown, @Req() request: any,
) {
  return this.offboarding.updateTask(id, taskId, offboardingTaskSchema.parse(body), this.userId(request));
}@Post('employees/:id/offboarding/complete')@RequirePermission('hr','update')completeOffboarding(@Param('id')id:string,@Req()r:any){return this.offboarding.complete(id,this.userId(r))}@Patch('employees/:id')@RequirePermission('hr','update')updateEmployee(@Param('id') id: string, @Body() body: unknown) {
  return this.hrService.updateEmployee(id, employeeUpdateSchema.parse(body));
}@Delete('employees/:id')@RequirePermission('hr','delete')deleteEmployee(@Param('id')id:string){return this.hrService.deleteEmployee(id)}@Get('salary-contracts')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})salaryContractList(){return this.salaryContracts.listAll()}@Get('employees/:id/salary-contracts')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})salaryContractHistory(@Param('id')id:string){return this.salaryContracts.list(id)}@Get('employees/:id/salary-contracts/active')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})activeSalaryContract(@Param('id')id:string,@Query('asOf')asOf:string){return this.salaryContracts.active(id,asOf)}@Post('employees/:id/salary-contracts')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})createSalaryContract(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.salaryContracts.create(id, salaryContractSchema.parse(body), this.userId(request));
}@Post('salary-contracts/:id/end')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})endSalaryContract(@Param('id') id: string, @Body() body: unknown) {
  return this.salaryContracts.end(id, salaryContractEndSchema.parse(body).effectiveTo);
}
@Get('organization')organizationStructure(){return this.organization.structure()}@Get('organization/branches')organizationBranches(){return this.organization.branches()}@Get('organization/departments')organizationDepartments(){return this.organization.departments()}@Get('organization/teams')organizationTeams(){return this.organization.teams()}@Get('organization/positions')organizationPositions(@Query('departmentId')departmentId?:string){return this.organization.positions(departmentId)}@Post('organization/departments')@RequirePermission('hr','create')createDepartment(@Body() body: unknown) {
  return this.organization.createDepartment(createDepartmentSchema.parse(body));
}@Post('organization/teams')@RequirePermission('hr','create')createTeam(@Body() body: unknown) {
  return this.organization.createTeam(createTeamSchema.parse(body));
}@Post('organization/positions')@RequirePermission('hr','create')createPosition(@Body() body: unknown) {
  return this.organization.createPosition(createPositionSchema.parse(body));
}@Get('employees/:id/assignments')employeeAssignments(@Param('id')id:string){return this.organization.employeeHistory(id)}@Post('employees/:id/assignments')@RequirePermission('hr','create')assignEmployee(@Param('id') id: string, @Body() body: unknown) {
  return this.organization.assign(id, employeeAssignmentSchema.parse(body));
}
@Get('employees/:id/assets')employeeAssetsList(@Param('id')id:string){return this.employeeAssets.list(id)}@Get('employees/:id/assets/available')employeeAvailableAssets(@Param('id')id:string){return this.employeeAssets.available(id)}@Post('employees/:id/assets/assign')@RequirePermission('hr','create')assignEmployeeAsset(@Param('id') id: string, @Body() body: unknown) {
  const input = assetAssignmentSchema.parse(body);
  return this.employeeAssets.assign(id, input.assetId, input.note);
}@Post('employees/:id/assets/:assetId/return')@RequirePermission('hr','update')returnEmployeeAsset(
  @Param('id') id: string,
  @Param('assetId') assetId: string,
  @Body() body: unknown,
) {
  return this.employeeAssets.returnAsset(id, assetId, assetReturnSchema.parse(body).note);
}
@Get('personnel-files')personnelFiles(){return this.hrService.personnelFiles()}@Get('personnel-files/sensitive')@RequirePermissions({resource:'hr_sensitive',action:'read'})sensitivePersonnelFiles(){return this.hrService.personnelFiles(true)}@Get('attendance')attendance(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.hrService.attendance(period.year, period.month);
}@Post('attendance')@RequirePermission('hr','create')saveAttendance(@Body()b:any){return this.hrService.upsertAttendance(b)}@Get('leaves')leaves(){return this.hrService.leaves()}@Post('leaves')@RequirePermission('hr','create')createLeave(@Body() body: unknown) {
  return this.hrService.createLeave(createLeaveSchema.parse(body));
}@Patch('leaves/:id')@RequirePermission('hr','update')updateLeave(@Param('id') id: string, @Body() body: unknown) {
  return this.hrService.updateLeave(id, updateLeaveSchema.parse(body));
}@Delete('leaves/:id')@RequirePermission('hr','delete')deleteLeave(@Param('id')id:string){return this.hrService.deleteLeave(id)}@Get('analytics')analytics(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  const now = new Date();
  return this.hrAnalytics.summary(period.year ?? now.getFullYear(), period.month ?? now.getMonth() + 1);
}@Get('payroll')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payroll(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.hrService.payroll(period.year, period.month);
}@Get('payroll/dashboard')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollDashboardSummary(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.payrollDashboard.summary(period.year, period.month);
}@Get('payroll/work-inputs')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollWorkInputPreview(@Query('year') year: string, @Query('month') month: string) {
  const period = requiredPeriodQuerySchema.parse({ year, month });
  return this.payrollWorkInputs.preview(period.year, period.month);
}@Post('payroll/work-inputs/close')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})closePayrollWorkInputs(@Body() body: unknown, @Req() request: any) {
  const period = requiredPeriodQuerySchema.parse(body);
  return this.payrollWorkInputs.closeMonth(period.year, period.month, this.userId(request));
}@Get('payroll/policy')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollPolicySettings(){return this.payrollPolicy.getSettings()}@Put('payroll/policy')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})updatePayrollPolicy(@Body() body: unknown, @Req() request: any) {
  return this.payrollPolicy.updateSettings(payrollPolicySchema.parse(body), this.userId(request));
}@Get('payroll/policy/preview')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollPolicyPreview(@Query('year') year: string, @Query('month') month: string) {
  const period = requiredPeriodQuerySchema.parse({ year, month });
  return this.payrollPolicy.preview(period.year, period.month);
}@Post('payroll/legal-parameters')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})createPayrollLegalParameters(@Body() body: unknown, @Req() request: any) {
  return this.payrollLegalEngine.createVersion(payrollLegalVersionSchema.parse(body), this.userId(request));
}@Post('payroll/legal-parameters/:id/publish')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})publishPayrollLegalParameters(@Param('id')id:string,@Req()r:any){return this.payrollLegalEngine.publishVersion(id,this.userId(r))}@Get('payroll/legal-parameters/active')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})activePayrollLegalParameters(@Query('asOf') asOf: string) {
  return this.payrollLegalEngine.activeVersion(dateQuerySchema.parse({ asOf }).asOf);
}@Post('payroll/legal-engine/net-to-gross')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})calculateNetToGross(@Body() body: unknown) {
  return this.payrollLegalEngine.calculateNetContract(netToGrossSchema.parse(body));
}@Get('payroll/tax-base-openings')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollTaxBaseOpenings(@Query('year') year?: string) {
  return this.payrollCalculation.openingBalances(yearQuerySchema.parse({ year }).year);
}@Put('payroll/tax-base-openings/:staffId')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})upsertPayrollTaxBaseOpening(
  @Param('staffId') staffId: string,
  @Body() body: unknown,
  @Req() request: any,
) {
  return this.payrollCalculation.upsertOpeningBalance(
    staffId,
    taxBaseOpeningSchema.parse(body),
    this.userId(request),
  );
}@Post('payroll/periods')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})createPayrollPeriod(@Body() body: unknown) {
  const period = requiredPeriodQuerySchema.parse(body);
  return this.payrollPeriods.create(period.year, period.month);
}@Post('payroll/periods/:id/prepare')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})preparePayrollPeriod(@Param('id')id:string){return this.payrollCalculation.prepare(id)}@Post('payroll/periods/:id/items')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})upsertPayrollItem(@Param('id')id:string,@Body()b:any){return this.payrollAccounting.upsertItem(id,{...b,grossAmount:Number(b.grossAmount),netAmount:Number(b.netAmount),employerCost:Number(b.employerCost)})}@Post('payroll/periods/:id/items/:staffId/work-inputs')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})attachPayrollWorkInputs(@Param('id')id:string,@Param('staffId')s:string){return this.payrollWorkInputs.attachToDraft(id,s)}@Post('payroll/periods/:id/work-inputs/attach-all')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})attachAllPayrollWorkInputs(@Param('id')id:string){return this.payrollWorkInputs.attachAllToDraft(id)}@Post('payroll/periods/:id/items/:staffId/policy-evaluation')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})attachPayrollPolicyEvaluation(@Param('id')id:string,@Param('staffId')s:string){return this.payrollPolicy.attachEvaluation(id,s)}@Post('payroll/periods/:id/submit')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})submitPayroll(@Param('id')id:string,@Req()r:any){return this.payrollAccounting.submit(id,this.userId(r))}@Post('payroll/periods/:id/approve')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})approvePayroll(@Param('id')id:string,@Req()r:any){return this.payrollAccounting.approve(id,this.userId(r))}@Post('payroll/periods/:id/post')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})postPayroll(@Param('id')id:string){return this.payrollPosting.post(id)}@Post('payroll/periods/:id/cancel')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})cancelPayroll(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.payrollReversal.cancel(
    id,
    this.userId(request),
    payrollReversalSchema.parse(body).reason,
  );
}@Post('payroll/periods/:id/reverse')@RequirePermissions({resource:'hr',action:'update'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})reversePayroll(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  return this.payrollReversal.reverse(
    id,
    this.userId(request),
    payrollReversalSchema.parse(body).reason,
  );
}@Get('payroll/periods/:id/report')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollPeriodReport(@Param('id')id:string){return this.payrollReport.period(id)}@Get('payroll/payment-queue')@RequirePermissions({resource:'payments',action:'read'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payrollPaymentQueue(){return this.payrollSettlement.paymentQueue()}@Post('payroll/payment-queue/:queueId/pay')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})payPayrollQueueItem(
  @Param('queueId') queueId: string,
  @Body() body: unknown,
  @Req() request: any,
) {
  const input = payQueueItemSchema.parse(body);
  return this.payrollSettlement.payQueueItem(
    queueId,
    Number(input.amount),
    input.method,
    this.userId(request),
    input.note ?? undefined,
  );
}@Post('payroll/periods/:id/payments')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})paySalary(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  const input = salaryPaymentSchema.parse(body);
  return this.payrollSettlement.paySalary(
    id,
    input.staffId,
    input.amount,
    input.method,
    this.userId(request),
    input.note ?? undefined,
  );
}@Post('payroll/periods/:id/liabilities')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})settleLiability(@Param('id') id: string, @Body() body: unknown, @Req() request: any) {
  const input = settleLiabilitySchema.parse(body);
  return this.payrollSettlement.settleLiability(
    id,
    input.type,
    input.amount,
    input.method,
    this.userId(request),
    input.note ?? undefined,
  );
}@Post('payroll/payments/:paymentId/reverse')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})reverseSalaryPayment(
  @Param('paymentId') paymentId: string,
  @Body() body: unknown,
  @Req() request: any,
) {
  const input = paymentReversalSchema.parse(body);
  return this.paymentReversal.reverseSalaryPayment(paymentId, this.userId(request), input.reason);
}@Post('payroll/liability-payments/:paymentId/reverse')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'update'})reverseLiabilityPayment(
  @Param('paymentId') paymentId: string,
  @Body() body: unknown,
  @Req() request: any,
) {
  const input = paymentReversalSchema.parse(body);
  return this.paymentReversal.reverseLiabilityPayment(paymentId, this.userId(request), input.reason);
}@Get('payments')@RequirePermissions({resource:'payments',action:'read'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})payments(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.hrService.payments(period.year, period.month);
}@Post('payments')@RequirePermissions({resource:'payments',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})createPayment(@Body() body: unknown, @Req() request: any) {
  const input = legacySalaryPaymentSchema.parse(body);
  return this.payrollSettlement.paySalary(
    input.periodId,
    input.staffId,
    input.amount,
    input.method,
    this.userId(request),
    input.note ?? undefined,
  );
}@Get('sgk')@RequirePermissions({resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'read'})sgk(@Query('year') year?: string, @Query('month') month?: string) {
  const period = periodQuerySchema.parse({ year, month });
  return this.hrService.sgk(period.year, period.month);
}@Post('sgk')@RequirePermissions({resource:'hr',action:'create'},{resource:'hr_sensitive',action:'read'},{resource:'hr_payroll',action:'create'})createSgk(@Body() body: unknown) {
  return this.hrService.createSgk(createSgkSchema.parse(body));
}}