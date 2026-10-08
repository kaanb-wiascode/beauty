import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OvertimeService } from './overtime.service';

@Controller('hr/overtime')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class OvertimeController {
 constructor(private readonly overtime:OvertimeService){}
 private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id}
 @Get() list(@Query('from') from:string,@Query('to') to:string,@Query('status') status?:string){return this.overtime.list(from,to,status)}
 @Post('employees/:staffId/requests') @RequirePermissions({resource:'hr',action:'manage'}) request(@Param('staffId') staffId:string,@Body() body:any,@Req() req:any){return this.overtime.request(staffId,body,this.userId(req))}
 @Post('detect') @RequirePermissions({resource:'hr',action:'manage'}) detect(@Body() body:any,@Req() req:any){return this.overtime.detect(String(body.from??''),String(body.to??''),this.userId(req))}
 @Post(':id/manager-review') @RequirePermissions({resource:'hr',action:'manage'}) managerReview(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.overtime.managerReview(id,body.approve===true,String(body.note??''),this.userId(req))}
 @Post(':id/hr-review') @RequirePermissions({resource:'hr',action:'manage'}) hrReview(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.overtime.hrReview(id,body.approve===true,Number(body.approvedMinutes??0),String(body.treatment??'PAYROLL'),String(body.note??''),this.userId(req))}
}
