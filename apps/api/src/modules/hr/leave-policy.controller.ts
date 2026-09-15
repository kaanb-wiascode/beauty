import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { LeavePolicyService } from './leave-policy.service';

@Controller('hr/leave-management')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('hr','read')
export class LeavePolicyController {
  constructor(private readonly leave: LeavePolicyService) {}

  @Get('types')
  leaveTypes(){ return this.leave.leaveTypes(); }

  @Post('policies')
  @RequirePermissions({resource:'hr',action:'manage'})
  createPolicy(@Body() body:any){ return this.leave.createPolicy(body); }

  @Get('employees/:staffId/balances/:leaveTypeId')
  balance(@Param('staffId') staffId:string,@Param('leaveTypeId') leaveTypeId:string,@Query('year',ParseIntPipe) year:number){
    return this.leave.balance(staffId,leaveTypeId,year);
  }

  @Post('employees/:staffId/balances/:leaveTypeId/accrual')
  @RequirePermissions({resource:'hr',action:'manage'})
  accrue(@Param('staffId') staffId:string,@Param('leaveTypeId') leaveTypeId:string,@Body() body:any){
    return this.leave.accrue(staffId,leaveTypeId,Number(body.year),Number(body.month));
  }
}
