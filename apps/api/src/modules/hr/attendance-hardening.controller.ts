import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AttendanceHardeningService } from './attendance-hardening.service';

@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('hr', 'read')
export class AttendanceHardeningController {
  constructor(private readonly attendance: AttendanceHardeningService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('exceptions')
  exceptions(@Query('from') from: string, @Query('to') to: string) {
    return this.attendance.exceptions(from, to);
  }

  @Post('reconcile')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  reconcile(@Body() body: any) {
    return this.attendance.reconcile(String(body.from ?? ''), String(body.to ?? ''));
  }

  @Post(':id/corrections')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  correct(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.attendance.correct(id, body, this.userId(req));
  }
}
