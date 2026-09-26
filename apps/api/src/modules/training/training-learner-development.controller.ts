import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLearnerDevelopmentService } from './training-learner-development.service';

const uuid = z.string().uuid();

@Controller('training/learner')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingLearnerDevelopmentController {
  constructor(private readonly development: TrainingLearnerDevelopmentService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('me/development-plans')
  @RequirePermission('training', 'read')
  list(@Req() req: { user?: { sub?: string } }) {
    return this.development.list(this.userId(req));
  }

  @Get('me/development-plans/:planId')
  @RequirePermission('training', 'read')
  detail(@Param('planId') planId: string, @Req() req: { user?: { sub?: string } }) {
    return this.development.detail(this.userId(req), uuid.parse(planId));
  }
}
