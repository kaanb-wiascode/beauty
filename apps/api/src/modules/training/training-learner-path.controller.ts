import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLearnerPathService } from './training-learner-path.service';

const uuid = z.string().uuid();

@Controller('training/learner-paths')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingLearnerPathController {
  constructor(private readonly learnerPaths: TrainingLearnerPathService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('me')
  @RequirePermission('training','read')
  list(@Req() req: { user?: { sub?: string } }) {
    return this.learnerPaths.list(this.userId(req));
  }

  @Get('me/:programAssignmentId')
  @RequirePermission('training','read')
  detail(@Param('programAssignmentId') programAssignmentId: string, @Req() req: { user?: { sub?: string } }) {
    return this.learnerPaths.detail(this.userId(req),uuid.parse(programAssignmentId));
  }
}
