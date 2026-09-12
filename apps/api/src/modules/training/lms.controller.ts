import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { LmsService } from './lms.service';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createVersionSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  theoryPassScore: z.coerce.number().min(0).max(100).optional(),
  practicalPassScore: z.coerce.number().min(0).max(100).optional(),
  effectiveFrom: dateOnly.nullable().optional(),
  effectiveTo: dateOnly.nullable().optional(),
});

const lessonSchema = z.object({
  sequence: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  contentType: z.enum(['TEXT', 'VIDEO', 'LINK', 'DOCUMENT']),
  contentText: z.string().max(50000).nullable().optional(),
  contentRef: z.string().trim().max(2000).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(0).nullable().optional(),
  isRequired: z.boolean().optional(),
});

const examSchema = z.object({
  title: z.string().trim().min(1).max(300),
  passScore: z.coerce.number().min(0).max(100).optional(),
  maxAttempts: z.coerce.number().int().positive().nullable().optional(),
});

const questionAnswerSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

const questionSchema = z.object({
  sequence: z.coerce.number().int().positive(),
  questionType: z.enum([
    'SINGLE_CHOICE',
    'MULTIPLE_CHOICE',
    'TRUE_FALSE',
  ]),
  prompt: z.string().trim().min(1).max(5000),
  options: z.unknown().optional(),
  correctAnswer: questionAnswerSchema,
  points: z.coerce.number().positive().max(10000).optional(),
});

const examAttemptSchema = z
  .object({
    answers: z.record(z.string().uuid(), z.unknown()),
  })
  .refine((value) => Object.keys(value.answers).length > 0, {
    message: 'At least one exam answer is required.',
    path: ['answers'],
  });

const practicalAssessmentSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  criteria: z.unknown().optional(),
  evidence: z.unknown().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
  assessedAt: z.coerce.date().optional(),
});

const certificateQuerySchema = z.object({
  staffId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('training/lms')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class LmsController {
  constructor(private readonly lms: LmsService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Post('courses/:courseId/versions')
  @RequirePermission('training', 'manage')
  createVersion(
    @Param('courseId') courseId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.createVersion(
      uuid.parse(courseId),
      createVersionSchema.parse(body),
      this.userId(req),
    );
  }

  @Get('courses/:courseId/versions')
  @RequirePermission('training', 'read')
  versions(@Param('courseId') courseId: string) {
    return this.lms.listVersions(uuid.parse(courseId));
  }

  @Post('versions/:versionId/lessons')
  @RequirePermission('training', 'manage')
  addLesson(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.addLesson(
      uuid.parse(versionId),
      lessonSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('versions/:versionId/exams')
  @RequirePermission('training', 'manage')
  createExam(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.createExam(
      uuid.parse(versionId),
      examSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('exams/:examId/questions')
  @RequirePermission('training', 'manage')
  addQuestion(
    @Param('examId') examId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.addQuestion(
      uuid.parse(examId),
      questionSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('versions/:versionId/publish')
  @RequirePermission('training', 'manage')
  publish(
    @Param('versionId') versionId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.publishVersion(
      uuid.parse(versionId),
      this.userId(req),
    );
  }

  @Get('courses/:courseId/published')
  @RequirePermission('training', 'read')
  published(@Param('courseId') courseId: string) {
    return this.lms.publishedCourse(uuid.parse(courseId));
  }

  @Post('assignments/:assignmentId/exams/:examId/attempts')
  @RequirePermission('training', 'manage')
  attempt(
    @Param('assignmentId') assignmentId: string,
    @Param('examId') examId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.submitExamAttempt(
      uuid.parse(assignmentId),
      uuid.parse(examId),
      examAttemptSchema.parse(body),
      this.userId(req),
    );
  }

  @Post('assignments/:assignmentId/practical-assessments')
  @RequirePermission('training', 'manage')
  practical(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = practicalAssessmentSchema.parse(body);
    return this.lms.assessPractical(
      uuid.parse(assignmentId),
      {
        ...input,
        assessedAt: input.assessedAt?.toISOString(),
      },
      this.userId(req),
    );
  }

  @Get('assignments/:assignmentId/result')
  @RequirePermission('training', 'read')
  result(@Param('assignmentId') assignmentId: string) {
    return this.lms.result(uuid.parse(assignmentId));
  }

  @Post('assignments/:assignmentId/finalize')
  @RequirePermission('training', 'manage')
  finalize(
    @Param('assignmentId') assignmentId: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lms.finalize(
      uuid.parse(assignmentId),
      this.userId(req),
    );
  }

  @Get('certificates')
  @RequirePermission('training', 'read')
  certificates(@Query() query: unknown) {
    return this.lms.listCertificates(certificateQuerySchema.parse(query));
  }
}
