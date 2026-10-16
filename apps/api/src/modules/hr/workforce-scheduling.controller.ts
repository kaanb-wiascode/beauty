import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission, RequirePermissions } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { WorkforceSchedulingService } from './workforce-scheduling.service';

@Controller('hr/workforce')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('hr', 'read')
export class WorkforceSchedulingController {
  constructor(private readonly workforce: WorkforceSchedulingService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }

  @Get('shift-templates')
  templates() { return this.workforce.templates(); }

  @Post('shift-templates')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createTemplate(@Body() body: any, @Req() req: any) { return this.workforce.createTemplate(body, this.userId(req)); }

  @Get('recurrence-rules')
  recurrenceRules() { return this.workforce.recurrenceRules(); }

  @Post('recurrence-rules')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createRecurrenceRule(@Body() body: any, @Req() req: any) { return this.workforce.createRecurrenceRule(body, this.userId(req)); }

  @Post('recurrence-rules/generate')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  generateRecurring(@Body() body: any, @Req() req: any) { return this.workforce.generateRecurring(String(body.from ?? ''), String(body.to ?? ''), this.userId(req)); }

  @Get('calendar')
  calendar(@Query('from') from: string, @Query('to') to: string) { return this.workforce.calendar(from, to); }

  @Post('shifts')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  createShift(@Body() body: any, @Req() req: any) { return this.workforce.createShift(body, this.userId(req)); }

  @Post('shifts/:shiftId/publish')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  publish(@Param('shiftId') shiftId: string, @Req() req: any) { return this.workforce.publish(shiftId, this.userId(req)); }

  @Get('shifts/:shiftId/staffing')
  staffing(@Param('shiftId') shiftId: string) { return this.workforce.staffing(shiftId); }

  @Post('shifts/:shiftId/assignments')
  @RequirePermissions({ resource: 'hr', action: 'manage' })
  assign(@Param('shiftId') shiftId: string, @Body() body: any, @Req() req: any) { return this.workforce.assign(shiftId, String(body.staffId ?? ''), this.userId(req)); }
}
