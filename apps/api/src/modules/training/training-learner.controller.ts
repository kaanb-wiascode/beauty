import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLearnerService } from './training-learner.service';

const uuid = z.string().uuid();
const identitySchema = z.object({ userId: uuid, staffId: uuid });

@Controller('training/learner')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingLearnerController {
  constructor(private readonly learner: TrainingLearnerService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Post('identities')
  @RequirePermission('training', 'manage')
  linkIdentity(@Body() body: unknown, @Req() req: { user?: { sub?: string } }) {
    return this.learner.linkIdentity(identitySchema.parse(body), this.userId(req));
  }

  @Post('me/link-by-email')
  @RequirePermission('training', 'read')
  autoLink(@Req() req: { user?: { sub?: string } }) {
    return this.learner.linkSelfByEmail(this.userId(req));
  }

  @Get('me')
  @RequirePermission('training', 'read')
  me(@Req() req: { user?: { sub?: string } }) {
    return this.learner.me(this.userId(req));
  }

  @Get('me/assignments')
  @RequirePermission('training', 'read')
  assignments(@Req() req: { user?: { sub?: string } }) {
    return this.learner.assignments(this.userId(req));
  }

  @Get('me/assignments/:assignmentId')
  @RequirePermission('training', 'read')
  detail(@Param('assignmentId') assignmentId: string, @Req() req: { user?: { sub?: string } }) {
    return this.learner.assignmentDetail(this.userId(req), uuid.parse(assignmentId));
  }

  @Post('me/assignments/:assignmentId/lessons/:lessonId/start')
  @RequirePermission('training', 'read')
  start(
    @Param('assignmentId') assignmentId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.learner.startLesson(this.userId(req), uuid.parse(assignmentId), uuid.parse(lessonId));
  }

  @Post('me/assignments/:assignmentId/lessons/:lessonId/complete')
  @RequirePermission('training', 'read')
  complete(
    @Param('assignmentId') assignmentId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.learner.completeLesson(this.userId(req), uuid.parse(assignmentId), uuid.parse(lessonId));
  }

  @Get('me/assignments/:assignmentId/lessons/:lessonId/document')
  @RequirePermission('training', 'read')
  document(
    @Param('assignmentId') assignmentId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.learner.lessonDocument(this.userId(req), uuid.parse(assignmentId), uuid.parse(lessonId));
  }
}
