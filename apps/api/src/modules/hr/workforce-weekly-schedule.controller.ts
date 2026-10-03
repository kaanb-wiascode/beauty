import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { WorkforceWeeklyScheduleService } from './workforce-weekly-schedule.service';

@Controller('hr/workforce/weekly-schedules')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class WorkforceWeeklyScheduleController {
 constructor(private readonly schedules:WorkforceWeeklyScheduleService){}
 private actor(req:any){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
 @Get() list(@Query('from') from:string,@Query('to') to:string){return this.schedules.list(from,to);}
 @Post() @RequirePermissions({resource:'hr',action:'manage'}) create(@Body() body:any,@Req() req:any){return this.schedules.create(String(body.branchId??''),String(body.weekStart??''),this.actor(req));}
 @Post(':id/collect-draft-shifts') @RequirePermissions({resource:'hr',action:'manage'}) collect(@Param('id') id:string){return this.schedules.attachDraftShifts(id);}
 @Post(':id/submit') @RequirePermissions({resource:'hr',action:'manage'}) submit(@Param('id') id:string,@Req() req:any){return this.schedules.submit(id,this.actor(req));}
 @Post(':id/approve') @RequirePermissions({resource:'hr',action:'manage'}) approve(@Param('id') id:string,@Req() req:any){return this.schedules.approve(id,this.actor(req));}
 @Post(':id/publish') @RequirePermissions({resource:'hr',action:'manage'}) publish(@Param('id') id:string,@Req() req:any){return this.schedules.publish(id,this.actor(req));}
}
