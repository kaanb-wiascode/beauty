import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingLearningPathService } from './training-learning-path.service';

@Controller('training/learning-paths')
@UseGuards(JwtAuthGuard,TenantAuthGuard,PermissionsGuard)
export class TrainingLearningPathController {
  constructor(private readonly learningPaths: TrainingLearningPathService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('training','read')
  list() { return this.learningPaths.list(); }

  @Get(':programId')
  @RequirePermission('training','read')
  workspace(@Param('programId') programId: string) { return this.learningPaths.workspace(programId); }

  @Get('assignments/:programAssignmentId/progress')
  @RequirePermission('training','read')
  progress(@Param('programAssignmentId') programAssignmentId: string) { return this.learningPaths.assignmentProgress(programAssignmentId); }

  @Post('versions/:versionId/items/:itemId/prerequisites')
  @RequirePermission('training','manage')
  addPrerequisite(
    @Param('versionId') versionId: string,
    @Param('itemId') itemId: string,
    @Body() body: { prerequisiteItemId: string },
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.learningPaths.addPrerequisite(versionId,itemId,body.prerequisiteItemId,this.userId(req));
  }

  @Delete('versions/:versionId/items/:itemId/prerequisites/:prerequisiteItemId')
  @RequirePermission('training','manage')
  removePrerequisite(
    @Param('versionId') versionId: string,
    @Param('itemId') itemId: string,
    @Param('prerequisiteItemId') prerequisiteItemId: string,
  ) {
    return this.learningPaths.removePrerequisite(versionId,itemId,prerequisiteItemId);
  }
}
