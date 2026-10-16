import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { QualityInspectionSchedulerService } from './quality-inspection-scheduler.service';

const processDueSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  workerId: z.string().trim().min(1).max(120).optional(),
});

@Controller('quality/inspections/schedules')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityInspectionSchedulerController {
  constructor(
    private readonly scheduler: QualityInspectionSchedulerService,
  ) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Post('process-due')
  @RequirePermission('quality', 'manage')
  processDue(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.scheduler.processDue(
      this.userId(req),
      processDueSchema.parse(body ?? {}),
    );
  }
}
