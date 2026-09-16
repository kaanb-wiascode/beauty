import { Body, Controller, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityInspectionLifecycleService } from './quality-inspection-lifecycle.service';

@Controller('quality/inspections')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityInspectionLifecycleController {
  constructor(private readonly lifecycle: QualityInspectionLifecycleService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Post(':id/cancel')
  @RequirePermission('quality', 'manage')
  cancel(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lifecycle.cancel(id, String(body?.reason ?? ''), this.userId(req));
  }

  @Post(':id/reschedule')
  @RequirePermission('quality', 'manage')
  reschedule(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.lifecycle.reschedule(
      id,
      {
        plannedFor: String(body?.plannedFor ?? ''),
        inspectorUserId: body?.inspectorUserId ?? null,
        reason: body?.reason ?? null,
      },
      this.userId(req),
    );
  }
}
