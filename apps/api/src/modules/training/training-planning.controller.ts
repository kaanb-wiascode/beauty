import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingPlanningService } from './training-planning.service';

@Controller('training/planning')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingPlanningController {
  constructor(private readonly planning:TrainingPlanningService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
  @Get('calendar') @RequirePermission('training','read') calendar(@Query('from')from?:string,@Query('to')to?:string,@Query('branchId')branchId?:string){return this.planning.calendar({from,to,branchId});}
  @Post('sessions') @RequirePermission('training','manage') session(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.createSession(body,this.userId(req));}
  @Post('sessions/:id/enroll') @RequirePermission('training','manage') enroll(@Param('id')id:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.enroll(id,body,this.userId(req));}
  @Get('development-plans') @RequirePermission('training','read') plans(@Query('staffId')staffId?:string){return this.planning.listPlans(staffId||undefined);}
  @Post('development-plans') @RequirePermission('training','manage') plan(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.createPlan(body,this.userId(req));}
  @Post('development-plans/:id/items') @RequirePermission('training','manage') item(@Param('id')id:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.planning.addPlanItem(id,body,this.userId(req));}
}
