import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingQuestionBankService } from './training-question-bank.service';

@Controller('training/lms/question-bank')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingQuestionBankController {
  constructor(private readonly questions: TrainingQuestionBankService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('training', 'manage')
  list(@Query('status') status?: string, @Query('category') category?: string, @Query('limit') limit?: string) {
    return this.questions.list({ status, category, limit: limit ? Number(limit) : undefined });
  }

  @Post()
  @RequirePermission('training', 'manage')
  create(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.questions.create(body, this.userId(req));
  }

  @Post(':id/publish')
  @RequirePermission('training', 'manage')
  publish(@Param('id') id: string, @Req() req: { user?: { sub?: string } }) {
    return this.questions.publish(id, this.userId(req));
  }

  @Post(':id/exams/:examId')
  @RequirePermission('training', 'manage')
  addToExam(
    @Param('id') id: string,
    @Param('examId') examId: string,
    @Body() body: { sequence: number; points?: number },
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.questions.addToExam(examId, id, body, this.userId(req));
  }
}
