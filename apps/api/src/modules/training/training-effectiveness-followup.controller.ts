import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { TrainingEffectivenessFollowupService } from './training-effectiveness-followup.service';

@Controller('training/effectiveness/followups')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class TrainingEffectivenessFollowupController {
  constructor(
    private readonly followups: TrainingEffectivenessFollowupService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Post('process')
  @RequirePermission('training', 'manage')
  process(
    @Query('dueDays') dueDays: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.followups.process(this.userId(req), {
      dueDays: dueDays ? Number(dueDays) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get()
  @RequirePermission('training', 'read')
  list(
    @Query('branchId') branchId?: string,
    @Query('staffId') staffId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.followups.list({
      branchId: branchId || undefined,
      staffId: staffId || undefined,
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/acknowledge')
  @RequirePermission('training', 'manage')
  acknowledge(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.followups.transition(
      id,
      'ACKNOWLEDGED',
      { note: body?.note ?? null },
      this.userId(req),
    );
  }

  @Post(':id/resolve')
  @RequirePermission('training', 'manage')
  resolve(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.followups.transition(
      id,
      'RESOLVED',
      { note: body?.note ?? null },
      this.userId(req),
    );
  }

  @Post(':id/cancel')
  @RequirePermission('training', 'manage')
  cancel(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.followups.transition(
      id,
      'CANCELLED',
      { note: body?.note ?? null },
      this.userId(req),
    );
  }
}
