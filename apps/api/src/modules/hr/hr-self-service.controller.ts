import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { HrSelfServiceService } from './hr-self-service.service';
@Controller('hr/self-service')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr_self_service','read')
export class HrSelfServiceController {
 constructor(private readonly selfService:HrSelfServiceService){}
 private userId(r:any){const id=r.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
 @Get('me') me(@Req()r:any){return this.selfService.employeeHome(this.userId(r));}
 @Get('me/notifications') notifications(@Req()r:any){return this.selfService.notifications(this.userId(r));}
 @Post('me/notifications/:id/read') markNotificationRead(@Param('id')id:string,@Req()r:any){return this.selfService.markNotificationRead(this.userId(r),id);}
 @Post('me/notifications/read-all') markAllNotificationsRead(@Req()r:any){return this.selfService.markAllNotificationsRead(this.userId(r));}
 @Get('me/payroll-status') payrollStatus(@Req()r:any){return this.selfService.payrollStatus(this.userId(r));}
 @Post('me/leave-requests') requestLeave(@Req()r:any,@Body()b:any){return this.selfService.requestLeave(this.userId(r),b);}
 @Post('me/attendance/clock-in') clockIn(@Req()r:any){return this.selfService.recordAttendanceEvent(this.userId(r),'CLOCK_IN');}
 @Post('me/attendance/break-start') breakStart(@Req()r:any){return this.selfService.recordAttendanceEvent(this.userId(r),'BREAK_START');}
 @Post('me/attendance/break-end') breakEnd(@Req()r:any){return this.selfService.recordAttendanceEvent(this.userId(r),'BREAK_END');}
 @Post('me/attendance/clock-out') clockOut(@Req()r:any){return this.selfService.recordAttendanceEvent(this.userId(r),'CLOCK_OUT');}
 @Get('manager') manager(@Req()r:any){return this.selfService.managerHome(this.userId(r));}
 @Post('employees/:staffId/link-user') @RequirePermission('hr','manage') link(@Param('staffId')staffId:string,@Body()b:any,@Req()r:any){return this.selfService.link(staffId,b.userId,this.userId(r));}
}
