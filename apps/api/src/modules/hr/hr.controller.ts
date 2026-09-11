import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { HrService } from './hr.service';
import { PayrollAccountingService } from './payroll-accounting.service';

@Controller('hr')
@UseGuards(JwtAuthGuard,TenantAuthGuard)
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly payrollAccounting: PayrollAccountingService,
  ) {}

  private userId(req:{user?:{sub?:string}}){ const id=req.user?.sub; if(!id) throw new UnauthorizedException('Authenticated user id is missing.'); return id; }

  @Get('employees') employees(){return this.hrService.employees();}
  @Post('employees') createEmployee(@Body()body:any){return this.hrService.createEmployee(body);}
  @Patch('employees/:id') updateEmployee(@Param('id')id:string,@Body()body:any){return this.hrService.updateEmployee(id,body);}
  @Delete('employees/:id') deleteEmployee(@Param('id')id:string){return this.hrService.deleteEmployee(id);}
  @Get('personnel-files') personnelFiles(){return this.hrService.personnelFiles();}
  @Get('attendance') attendance(@Query('year')year?:string,@Query('month')month?:string){return this.hrService.attendance(year?+year:undefined,month?+month:undefined);}
  @Post('attendance') saveAttendance(@Body()body:any){return this.hrService.upsertAttendance(body);}
  @Get('leaves') leaves(){return this.hrService.leaves();}
  @Post('leaves') createLeave(@Body()body:any){return this.hrService.createLeave(body);}
  @Patch('leaves/:id') updateLeave(@Param('id')id:string,@Body()body:any){return this.hrService.updateLeave(id,body);}
  @Delete('leaves/:id') deleteLeave(@Param('id')id:string){return this.hrService.deleteLeave(id);}

  @Get('payroll') payroll(@Query('year')year?:string,@Query('month')month?:string){return this.hrService.payroll(year?+year:undefined,month?+month:undefined);}
  @Post('payroll/periods') createPayrollPeriod(@Body()b:{year:number;month:number}){return this.hrService.createPayrollPeriod(+b.year,+b.month);}
  @Post('payroll/periods/:id/items')
  upsertPayrollItem(@Param('id')id:string,@Body()b:any){
    return this.payrollAccounting.upsertItem(id,{
      staffId:b.staffId,branchId:b.branchId,costCenterId:b.costCenterId,
      grossAmount:Number(b.grossAmount),netAmount:Number(b.netAmount),incomeTax:Number(b.incomeTax??0),stampTax:Number(b.stampTax??0),
      employeeSocialSecurity:Number(b.employeeSocialSecurity??0),unemploymentEmployee:Number(b.unemploymentEmployee??0),
      employerSocialSecurity:Number(b.employerSocialSecurity??0),unemploymentEmployer:Number(b.unemploymentEmployer??0),
      otherDeductions:Number(b.otherDeductions??0),employerCost:Number(b.employerCost),note:b.note,
    });
  }
  @Post('payroll/periods/:id/submit') submitPayroll(@Param('id')id:string){return this.payrollAccounting.submit(id);}
  @Post('payroll/periods/:id/approve') approvePayroll(@Param('id')id:string,@Req()req:{user?:{sub?:string}}){return this.payrollAccounting.approve(id,this.userId(req));}
  @Post('payroll/periods/:id/post') postPayroll(@Param('id')id:string){return this.payrollAccounting.post(id);}

  @Get('payments') payments(@Query('year')year?:string,@Query('month')month?:string){return this.hrService.payments(year?+year:undefined,month?+month:undefined);}
  @Post('payments') createPayment(@Body()body:any){return this.hrService.createPayment(body);}
  @Get('sgk') sgk(@Query('year')year?:string,@Query('month')month?:string){return this.hrService.sgk(year?+year:undefined,month?+month:undefined);}
  @Post('sgk') createSgk(@Body()body:any){return this.hrService.createSgk(body);}
}
