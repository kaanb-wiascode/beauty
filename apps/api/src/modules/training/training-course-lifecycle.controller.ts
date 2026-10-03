import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingCourseLifecycleService } from './training-course-lifecycle.service';

const uuid = z.string().uuid();

@Controller('training/courses')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingCourseLifecycleController {
  constructor(private readonly lifecycle: TrainingCourseLifecycleService) {}

  @Post(':courseId/archive')
  @RequirePermission('training', 'manage')
  archive(@Param('courseId') courseId: string) {
    return this.lifecycle.archive(uuid.parse(courseId));
  }

  @Post(':courseId/restore')
  @RequirePermission('training', 'manage')
  restore(@Param('courseId') courseId: string) {
    return this.lifecycle.restore(uuid.parse(courseId));
  }
}
