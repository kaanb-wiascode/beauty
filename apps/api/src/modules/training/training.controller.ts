import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingService } from './training.service';

@Controller('training')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('courses')
  @RequirePermission('training','read')
  listCourses(){return this.training.listCourses();}

  @Post('courses')
  @RequirePermission('training','manage')
  createCourse(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.createCourse(b,this.userId(req));}

  @Get('quality-rules')
  @RequirePermission('training','read')
  listQualityRules(){return this.training.listQualityRules();}

  @Post('quality-rules')
  @RequirePermission('training','manage')
  createQualityRule(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.createQualityRule(b,this.userId(req));}

  @Post('quality-rules/process')
  @RequirePermission('training','manage')
  processQualityRules(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.processQualityRules(this.userId(req),b?.limit==null?undefined:Number(b.limit));}

  @Get('assignments')
  @RequirePermission('training','read')
  listAssignments(@Query('status')status?:string,@Query('staffId')staffId?:string,@Query('limit')limit?:string){return this.training.listAssignments({status:status||undefined,staffId:staffId||undefined,limit:limit?Number(limit):undefined});}

  @Post('assignments')
  @RequirePermission('training','manage')
  createAssignment(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.createAssignment(b,this.userId(req));}

  @Post('assignments/process-expired')
  @RequirePermission('training','manage')
  processExpired(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.processExpired(this.userId(req),b?.limit==null?undefined:Number(b.limit));}

  @Post('assignments/:id/start')
  @RequirePermission('training','manage')
  start(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.startAssignment(id,this.userId(req),b?.note);}

  @Post('assignments/:id/complete')
  @RequirePermission('training','manage')
  complete(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.completeAssignment(id,this.userId(req),b?.note);}

  @Post('assignments/:id/cancel')
  @RequirePermission('training','manage')
  cancel(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.cancelAssignment(id,this.userId(req),b?.reason);}

  @Get('assignments/:id/events')
  @RequirePermission('training','read')
  events(@Param('id')id:string){return this.training.listAssignmentEvents(id);}
}
