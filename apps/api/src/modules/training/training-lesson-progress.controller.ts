import { Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLessonProgressService } from './training-lesson-progress.service';

@Controller('training/lms/assignments')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingLessonProgressController {
  constructor(private readonly progress:TrainingLessonProgressService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post(':assignmentId/lessons/:lessonId/start') @RequirePermission('training','manage')
  start(@Param('assignmentId')assignmentId:string,@Param('lessonId')lessonId:string,@Req()req:{user?:{sub?:string}}){return this.progress.start(assignmentId,lessonId,this.userId(req));}

  @Post(':assignmentId/lessons/:lessonId/complete') @RequirePermission('training','manage')
  complete(@Param('assignmentId')assignmentId:string,@Param('lessonId')lessonId:string,@Req()req:{user?:{sub?:string}}){return this.progress.complete(assignmentId,lessonId,this.userId(req));}

  @Get(':assignmentId/progress') @RequirePermission('training','read')
  summary(@Param('assignmentId')assignmentId:string){return this.progress.summary(assignmentId);}
}
