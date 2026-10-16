import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingAuthoringService } from './training-authoring.service';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const updateDraftSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  theoryPassScore: z.coerce.number().min(0).max(100).nullable().optional(),
  practicalPassScore: z.coerce.number().min(0).max(100).nullable().optional(),
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
const updateLessonSchema = lessonSchema.omit({ sequence: true }).partial();
const reorderLessonsSchema = z.object({ lessonIds: z.array(uuid).max(1000) });
const updateExamSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  passScore: z.coerce.number().min(0).max(100).optional(),
  maxAttempts: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
const answerSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);
const updateQuestionSchema = z.object({
  questionType: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']).optional(),
  prompt: z.string().trim().min(1).max(5000).optional(),
  options: z.unknown().optional(),
  correctAnswer: answerSchema.optional(),
  points: z.coerce.number().positive().max(10000).optional(),
});
const reorderQuestionsSchema = z.object({ questionIds: z.array(uuid).max(2000) });

@Controller('training/authoring')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingAuthoringController {
  constructor(private readonly authoring: TrainingAuthoringService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('versions/:versionId')
  @RequirePermission('training', 'manage')
  detail(@Param('versionId') versionId: string) {
    return this.authoring.detail(uuid.parse(versionId));
  }

  @Patch('versions/:versionId')
  @RequirePermission('training', 'manage')
  update(@Param('versionId') versionId: string, @Body() body: unknown) {
    return this.authoring.updateVersion(uuid.parse(versionId), updateDraftSchema.parse(body));
  }

  @Post('versions/:versionId/lessons')
  @RequirePermission('training', 'manage')
  createLesson(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.authoring.createLesson(uuid.parse(versionId), lessonSchema.parse(body), this.userId(req));
  }

  @Patch('lessons/:lessonId')
  @RequirePermission('training', 'manage')
  updateLesson(@Param('lessonId') lessonId: string, @Body() body: unknown) {
    return this.authoring.updateLesson(uuid.parse(lessonId), updateLessonSchema.parse(body));
  }

  @Delete('lessons/:lessonId')
  @RequirePermission('training', 'manage')
  deleteLesson(@Param('lessonId') lessonId: string) {
    return this.authoring.deleteLesson(uuid.parse(lessonId));
  }

  @Post('versions/:versionId/lessons/reorder')
  @RequirePermission('training', 'manage')
  reorderLessons(@Param('versionId') versionId: string, @Body() body: unknown) {
    const input = reorderLessonsSchema.parse(body);
    return this.authoring.reorderLessons(uuid.parse(versionId), input.lessonIds);
  }

  @Patch('exams/:examId')
  @RequirePermission('training', 'manage')
  updateExam(@Param('examId') examId: string, @Body() body: unknown) {
    return this.authoring.updateExam(uuid.parse(examId), updateExamSchema.parse(body));
  }

  @Delete('exams/:examId')
  @RequirePermission('training', 'manage')
  deleteExam(@Param('examId') examId: string) {
    return this.authoring.deleteExam(uuid.parse(examId));
  }

  @Patch('questions/:questionId')
  @RequirePermission('training', 'manage')
  updateQuestion(@Param('questionId') questionId: string, @Body() body: unknown) {
    return this.authoring.updateQuestion(uuid.parse(questionId), updateQuestionSchema.parse(body));
  }

  @Delete('questions/:questionId')
  @RequirePermission('training', 'manage')
  deleteQuestion(@Param('questionId') questionId: string) {
    return this.authoring.deleteQuestion(uuid.parse(questionId));
  }

  @Post('exams/:examId/questions/reorder')
  @RequirePermission('training', 'manage')
  reorderQuestions(@Param('examId') examId: string, @Body() body: unknown) {
    const input = reorderQuestionsSchema.parse(body);
    return this.authoring.reorderQuestions(uuid.parse(examId), input.questionIds);
  }
}
