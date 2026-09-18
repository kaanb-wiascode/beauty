import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingCourseModuleService } from './training-course-module.service';

const uuid = z.string().uuid();
const moduleSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
});
const updateModuleSchema = moduleSchema.partial();
const reorderSchema = z.object({ moduleIds: z.array(uuid).max(500) });

@Controller('training/authoring')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingCourseModuleController {
  constructor(private readonly modules: TrainingCourseModuleService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('versions/:versionId/modules')
  @RequirePermission('training', 'manage')
  list(@Param('versionId') versionId: string) {
    return this.modules.list(uuid.parse(versionId));
  }

  @Post('versions/:versionId/modules')
  @RequirePermission('training', 'manage')
  create(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.modules.create(uuid.parse(versionId), moduleSchema.parse(body), this.userId(req));
  }

  @Patch('modules/:moduleId')
  @RequirePermission('training', 'manage')
  update(@Param('moduleId') moduleId: string, @Body() body: unknown) {
    return this.modules.update(uuid.parse(moduleId), updateModuleSchema.parse(body));
  }

  @Delete('modules/:moduleId')
  @RequirePermission('training', 'manage')
  remove(@Param('moduleId') moduleId: string) {
    return this.modules.remove(uuid.parse(moduleId));
  }

  @Post('versions/:versionId/modules/reorder')
  @RequirePermission('training', 'manage')
  reorder(@Param('versionId') versionId: string, @Body() body: unknown) {
    const input = reorderSchema.parse(body);
    return this.modules.reorder(uuid.parse(versionId), input.moduleIds);
  }

  @Post('modules/:moduleId/lessons/:lessonId')
  @RequirePermission('training', 'manage')
  assignLesson(@Param('moduleId') moduleId: string, @Param('lessonId') lessonId: string) {
    return this.modules.assignLesson(uuid.parse(moduleId), uuid.parse(lessonId));
  }

  @Delete('lessons/:lessonId/module')
  @RequirePermission('training', 'manage')
  unassignLesson(@Param('lessonId') lessonId: string) {
    return this.modules.unassignLesson(uuid.parse(lessonId));
  }
}
