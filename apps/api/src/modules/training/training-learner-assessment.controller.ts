import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLearnerAssessmentService } from './training-learner-assessment.service';

const answersSchema=z.object({answers:z.record(z.string(),z.unknown())});

@Controller('training/learner/me/assignments')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingLearnerAssessmentController {
  constructor(private readonly assessment:TrainingLearnerAssessmentService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Get(':assignmentId/exams/:examId')
  @RequirePermission('training','read')
  exam(@Param('assignmentId')assignmentId:string,@Param('examId')examId:string,@Req()req:{user?:{sub?:string}}){return this.assessment.exam(this.userId(req),assignmentId,examId);}

  @Post(':assignmentId/exams/:examId/attempts')
  @RequirePermission('training','read')
  submit(@Param('assignmentId')assignmentId:string,@Param('examId')examId:string,@Body()body:unknown,@Req()req:{user?:{sub?:string}}){const input=answersSchema.parse(body);return this.assessment.submit(this.userId(req),assignmentId,examId,input.answers);}

  @Post(':assignmentId/finalize')
  @RequirePermission('training','read')
  finalize(@Param('assignmentId')assignmentId:string,@Req()req:{user?:{sub?:string}}){return this.assessment.finalize(this.userId(req),assignmentId);}
}
