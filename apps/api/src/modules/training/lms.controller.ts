import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { LmsService } from './lms.service';

@Controller('training/lms')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class LmsController {
  constructor(private readonly lms:LmsService){}
  private userId(req:{user?:{sub?:string}}){const id=req.user?.sub;if(!id)throw new UnauthorizedException('Authenticated user id is missing.');return id;}

  @Post('courses/:courseId/versions') @RequirePermission('training','manage')
  createVersion(@Param('courseId')courseId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.createVersion(courseId,b,this.userId(req));}

  @Get('courses/:courseId/versions') @RequirePermission('training','read')
  versions(@Param('courseId')courseId:string){return this.lms.listVersions(courseId);}

  @Post('versions/:versionId/lessons') @RequirePermission('training','manage')
  addLesson(@Param('versionId')versionId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.addLesson(versionId,b,this.userId(req));}

  @Post('versions/:versionId/exams') @RequirePermission('training','manage')
  createExam(@Param('versionId')versionId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.createExam(versionId,b,this.userId(req));}

  @Post('exams/:examId/questions') @RequirePermission('training','manage')
  addQuestion(@Param('examId')examId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.addQuestion(examId,b,this.userId(req));}

  @Post('versions/:versionId/publish') @RequirePermission('training','manage')
  publish(@Param('versionId')versionId:string,@Req()req:{user?:{sub?:string}}){return this.lms.publishVersion(versionId,this.userId(req));}

  @Get('courses/:courseId/published') @RequirePermission('training','read')
  published(@Param('courseId')courseId:string){return this.lms.publishedCourse(courseId);}

  @Post('assignments/:assignmentId/exams/:examId/attempts') @RequirePermission('training','manage')
  attempt(@Param('assignmentId')assignmentId:string,@Param('examId')examId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.submitExamAttempt(assignmentId,examId,b,this.userId(req));}

  @Post('assignments/:assignmentId/practical-assessments') @RequirePermission('training','manage')
  practical(@Param('assignmentId')assignmentId:string,@Body()b:any,@Req()req:{user?:{sub?:string}}){return this.lms.assessPractical(assignmentId,b,this.userId(req));}

  @Get('assignments/:assignmentId/result') @RequirePermission('training','read')
  result(@Param('assignmentId')assignmentId:string){return this.lms.result(assignmentId);}

  @Post('assignments/:assignmentId/finalize') @RequirePermission('training','manage')
  finalize(@Param('assignmentId')assignmentId:string,@Req()req:{user?:{sub?:string}}){return this.lms.finalize(assignmentId,this.userId(req));}

  @Get('certificates') @RequirePermission('training','read')
  certificates(@Query('staffId')staffId?:string,@Query('limit')limit?:string){return this.lms.listCertificates({staffId:staffId||undefined,limit:limit?Number(limit):undefined});}
}
