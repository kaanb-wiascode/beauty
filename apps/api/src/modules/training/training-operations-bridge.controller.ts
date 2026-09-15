import { Body, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingOperationsBridgeService } from './training-operations-bridge.service';

const uuid=z.string().uuid();
const competencySchema=z.object({trainingCompetencyId:uuid,hrCompetencyId:uuid}).strict();
const certificationSchema=z.object({courseId:uuid,hrCertificationTypeId:uuid}).strict();

@Controller('training/operations-bridge')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingOperationsBridgeController{
  constructor(private readonly bridge:TrainingOperationsBridgeService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}
  @Get('mappings') @RequirePermission('training','manage') mappings(){return this.bridge.mappings();}
  @Post('competencies') @RequirePermission('training','manage') mapCompetency(@Body()body:unknown,@Req()req:{user?:{sub?:string}}){return this.bridge.mapCompetency(competencySchema.parse(body),this.userId(req));}
  @Post('certifications') @RequirePermission('training','manage') mapCertification(@Body()body:unknown,@Req()req:{user?:{sub?:string}}){return this.bridge.mapCertification(certificationSchema.parse(body),this.userId(req));}
  @Post('process') @RequirePermission('training','manage') process(@Query('limit')limit:string|undefined,@Req()req:{user?:{sub?:string}}){return this.bridge.process(this.userId(req),limit?Number(limit):100);}
}
