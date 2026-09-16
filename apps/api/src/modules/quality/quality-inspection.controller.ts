import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityInspectionService } from './quality-inspection.service';

@Controller('quality/inspections')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class QualityInspectionController{
  constructor(private readonly inspections:QualityInspectionService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('templates')
  @RequirePermission('quality','read')
  listTemplates(){return this.inspections.listTemplates();}

  @Post('templates')
  @RequirePermission('quality','manage')
  createTemplate(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.inspections.createTemplate({name:b.name,description:b.description??null,category:b.category,items:Array.isArray(b.items)?b.items:[]},this.userId(req));}

  @Post('schedules')
  @RequirePermission('quality','manage')
  upsertSchedule(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.inspections.upsertSchedule({branchId:b.branchId,templateId:b.templateId,cadence:String(b.cadence??''),nextDueAt:b.nextDueAt,assigneeUserId:b.assigneeUserId??null},this.userId(req));}

  @Post()
  @RequirePermission('quality','manage')
  plan(@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.inspections.planInspection({branchId:b.branchId,templateId:b.templateId,plannedFor:b.plannedFor,scheduleId:b.scheduleId??null,inspectorUserId:b.inspectorUserId??null,idempotencyKey:b.idempotencyKey??null},this.userId(req));}

  @Get()
  @RequirePermission('quality','read')
  list(@Query('status')status?:string,@Query('limit')limit?:string){return this.inspections.listInspections({status:status||undefined,limit:limit?Number(limit):undefined});}

  @Post(':id/start')
  @RequirePermission('quality','manage')
  start(@Param('id')id:string,@Req()req:{user?:{sub?:string}}){return this.inspections.startInspection(id,this.userId(req));}

  @Post(':id/results')
  @RequirePermission('quality','manage')
  result(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.inspections.recordResult(id,{templateItemId:b.templateItemId,outcome:b.outcome,numericScore:b.numericScore??null,note:b.note??null,finding:b.finding??undefined},this.userId(req));}

  @Post(':id/complete')
  @RequirePermission('quality','manage')
  complete(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.inspections.completeInspection(id,this.userId(req),b?.notes);}

  @Post('findings/:findingId/case')
  @RequirePermission('quality','manage')
  toCase(@Param('findingId')findingId:string,@Req()req:{user?:{sub?:string}}){return this.inspections.convertFindingToCase(findingId,this.userId(req));}
}
