import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityScoreSchedulerService } from './quality-score-scheduler.service';

@Controller('quality/scores/schedules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityScoreSchedulerController {
  constructor(private readonly scheduler: QualityScoreSchedulerService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get()
  @RequirePermission('quality', 'read')
  list() {
    return this.scheduler.listSchedules();
  }

  @Post()
  @RequirePermission('quality', 'manage')
  create(@Body() body: any, @Req() req: { user?: { sub?: string } }) {
    return this.scheduler.createSchedule(
      {
        name: body.name,
        cadence: body.cadence,
        periodMode: body.periodMode,
        policyId: body.policyId ?? null,
        nextRunAt: body.nextRunAt,
      },
      this.userId(req),
    );
  }

  @Post('process-due')
  @RequirePermission('quality', 'manage')
  processDue(@Body() body: { limit?: number; workerId?: string }, @Req() req: { user?: { sub?: string } }) {
    return this.scheduler.processDue(this.userId(req), {
      limit: body?.limit,
      workerId: body?.workerId,
    });
  }
}
