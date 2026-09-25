import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingCompetencyBridgeService } from './training-competency-bridge.service';

@Controller('training/competency-bridge')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingCompetencyBridgeController {
  constructor(private readonly bridge: TrainingCompetencyBridgeService) {}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post('versions/:versionId/outcomes') @RequirePermission('training','manage')
  addOutcome(@Param('versionId')versionId:string,@Body()body:any,@Req()req:{user?:{sub?:string}}){return this.bridge.addOutcome(versionId,body,this.userId(req));}

  @Get('versions/:versionId/outcomes') @RequirePermission('training','read')
  outcomes(@Param('versionId')versionId:string){return this.bridge.listOutcomes(versionId);}

  @Post('process-completed') @RequirePermission('training','manage')
  process(@Query('limit')limit:string|undefined,@Req()req:{user?:{sub?:string}}){return this.bridge.processCompleted(this.userId(req),limit?Number(limit):50);}
}
