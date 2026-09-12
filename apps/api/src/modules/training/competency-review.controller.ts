import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyReviewService } from './competency-review.service';

@Controller('training/competency-reviews')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class CompetencyReviewController {
  constructor(private readonly reviews:CompetencyReviewService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('schedules')
  @RequirePermission('training','read')
  schedules(){return this.reviews.listSchedules();}

  @Post('schedules')
  @RequirePermission('training','manage')
  createSchedule(@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.reviews.createSchedule(body,this.userId(req));}

  @Post('schedules/process-due')
  @RequirePermission('training','manage')
  processDue(@Body()body:{limit?:number},@Req()req:{user?:{sub?:string}}){return this.reviews.processDue(this.userId(req),body?.limit);}

  @Get()
  @RequirePermission('training','read')
  list(@Query('staffId')staffId?:string,@Query('status')status?:string,@Query('limit')limit?:string){return this.reviews.listReviews({staffId:staffId||undefined,status:status||undefined,limit:limit?Number(limit):undefined});}

  @Post(':id/complete')
  @RequirePermission('training','manage')
  complete(@Param('id')id:string,@Req()req:{user?:{sub?:string}}){return this.reviews.complete(id,this.userId(req));}

  @Post(':id/cancel')
  @RequirePermission('training','manage')
  cancel(@Param('id')id:string,@Body()body:{reason?:string},@Req()req:{user?:{sub?:string}}){return this.reviews.cancel(id,body?.reason,this.userId(req));}
}
