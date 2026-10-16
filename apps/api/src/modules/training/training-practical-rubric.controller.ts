import { Body, Controller, Get, Param, Put, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingPracticalRubricService } from './training-practical-rubric.service';

const rubricSchema=z.object({title:z.string().trim().min(1).max(300),instructions:z.string().trim().max(5000).nullable().optional(),criteria:z.array(z.object({code:z.string().trim().min(1).max(100),label:z.string().trim().min(1).max(300),description:z.string().trim().max(2000).nullable().optional(),weightPercent:z.coerce.number().gt(0).lte(100),minimumScore:z.coerce.number().min(0).max(100).nullable().optional(),isRequired:z.boolean().optional()})).min(1).max(50)});
const assessSchema=z.object({scores:z.record(z.string(),z.coerce.number().min(0).max(100)),note:z.string().trim().max(5000).nullable().optional(),evidence:z.unknown().optional()});

@Controller('training/practical')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingPracticalRubricController{
  constructor(private readonly practical:TrainingPracticalRubricService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get('versions/:versionId/rubric') @RequirePermission('training','manage')
  rubric(@Param('versionId')versionId:string){return this.practical.get(versionId);}

  @Put('versions/:versionId/rubric') @RequirePermission('training','manage')
  save(@Param('versionId')versionId:string,@Body()body:unknown,@Req()req:{user?:{sub?:string}}){return this.practical.save(versionId,rubricSchema.parse(body),this.userId(req));}

  @Get('assessor-queue') @RequirePermission('training','manage')
  queue(){return this.practical.queue();}

  @Post('assignments/:assignmentId/assess') @RequirePermission('training','manage')
  assess(@Param('assignmentId')assignmentId:string,@Body()body:unknown,@Req()req:{user?:{sub?:string}}){return this.practical.assess(assignmentId,assessSchema.parse(body),this.userId(req));}
}
