import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityCapaService } from './quality-capa.service';

@Controller('quality')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class QualityCapaController{
  constructor(private readonly capa:QualityCapaService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post('findings/:id/assign')
  @RequirePermission('quality','manage')
  assignFinding(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.capa.assignFinding(id,{ownerUserId:b.ownerUserId??null,dueAt:b.dueAt??null},this.userId(req));}

  @Get('capa')
  @RequirePermission('quality','read')
  list(@Query('status')status?:string,@Query('limit')limit?:string){return this.capa.list({status:status||undefined,limit:limit?Number(limit):undefined});}

  @Post('cases/:caseId/capa')
  @RequirePermission('quality','manage')
  create(@Param('caseId')caseId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.capa.createFromCase(caseId,{rootCause:b.rootCause,correctiveAction:b.correctiveAction,preventiveAction:b.preventiveAction??null,ownerUserId:b.ownerUserId??null,dueAt:b.dueAt??null,verificationMethod:b.verificationMethod??null},this.userId(req));}

  @Post('capa/:id/transition')
  @RequirePermission('quality','manage')
  transition(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.capa.transition(id,String(b.status) as 'IN_PROGRESS'|'VERIFICATION'|'CLOSED',this.userId(req),b.note);}

  @Post('capa/:id/verify')
  @RequirePermission('quality','manage')
  verify(@Param('id')id:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.capa.verify(id,{effective:Boolean(b.effective),result:b.result},this.userId(req));}
}
