import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ShiftExchangeService } from './shift-exchange.service';

@Controller('hr/workforce/exchange')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
@RequirePermission('hr','read')
export class ShiftExchangeController {
 constructor(private readonly exchange:ShiftExchangeService){}
 private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id}
 @Get('swaps') swaps(){return this.exchange.swaps()}
 @Post('assignments/:assignmentId/swaps') @RequirePermissions({resource:'hr',action:'manage'}) requestSwap(@Param('assignmentId') assignmentId:string,@Body() body:any,@Req() req:any){return this.exchange.requestSwap(assignmentId,body.targetStaffId?String(body.targetStaffId):null,String(body.note??''),this.userId(req))}
 @Post('swaps/:id/accept') @RequirePermissions({resource:'hr',action:'manage'}) acceptSwap(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.exchange.acceptSwap(id,body.targetAssignmentId?String(body.targetAssignmentId):null,String(body.note??''),this.userId(req))}
 @Post('swaps/:id/review') @RequirePermissions({resource:'hr',action:'manage'}) reviewSwap(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.exchange.reviewSwap(id,body.approve===true,String(body.note??''),this.userId(req))}
 @Post('shifts/:shiftId/bids') @RequirePermissions({resource:'hr',action:'manage'}) bid(@Param('shiftId') shiftId:string,@Body() body:any){return this.exchange.bid(shiftId,String(body.staffId??''),String(body.note??''))}
 @Post('bids/:id/review') @RequirePermissions({resource:'hr',action:'manage'}) reviewBid(@Param('id') id:string,@Body() body:any,@Req() req:any){return this.exchange.reviewBid(id,body.approve===true,this.userId(req))}
}
