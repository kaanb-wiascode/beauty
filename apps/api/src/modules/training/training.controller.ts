import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
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
  @RequirePermission('quality','read')
  listCourses(){return this.training.listCourses();}

  @Post('courses')
  @RequirePermission('quality','manage')
  createCourse(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.createCourse(b,this.userId(req));}

  @Get('quality-rules')
  @RequirePermission('quality','read')
  listQualityRules(){return this.training.listQualityRules();}

  @Post('quality-rules')
  @RequirePermission('quality','manage')
  createQualityRule(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.createQualityRule(b,this.userId(req));}

  @Post('quality-rules/process')
  @RequirePermission('quality','manage')
  processQualityRules(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.training.processQualityRules(this.userId(req),b?.limit==null?undefined:Number(b.limit));}

  @Get('assignments')
  @RequirePermission('quality','read')
  listAssignments(@Query('status')status?:string,@Query('staffId')staffId?:string,@Query('limit')limit?:string){return this.training.listAssignments({status:status||undefined,staffId:staffId||undefined,limit:limit?Number(limit):undefined});}
}
