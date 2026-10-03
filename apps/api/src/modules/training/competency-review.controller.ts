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
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CompetencyReviewService } from './competency-review.service';

const uuid = z.string().uuid();
const scheduleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  cadenceDays: z.coerce.number().int().min(1).max(3650),
  dueOffsetDays: z.coerce.number().int().min(0).max(3650).optional(),
  branchId: uuid.nullable().optional(),
  profileId: uuid.nullable().optional(),
  nextRunAt: z.coerce.date().optional(),
});
const processDueSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const listSchema = z.object({
  staffId: uuid.optional(),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});
const cancelSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

@Controller('training/competency-reviews')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class CompetencyReviewController {
  constructor(private readonly reviews: CompetencyReviewService) {}

  private userId(req: { user?: { sub?: string } }) {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }

  @Get('schedules')
  @RequirePermission('training', 'read')
  schedules() {
    return this.reviews.listSchedules();
  }

  @Post('schedules')
  @RequirePermission('training', 'manage')
  createSchedule(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = scheduleSchema.parse(body);
    return this.reviews.createSchedule(
      {
        ...input,
        nextRunAt: input.nextRunAt?.toISOString(),
      },
      this.userId(req),
    );
  }

  @Post('schedules/process-due')
  @RequirePermission('training', 'manage')
  processDue(
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = processDueSchema.parse(body ?? {});
    return this.reviews.processDue(this.userId(req), input.limit);
  }

  @Get()
  @RequirePermission('training', 'read')
  list(@Query() query: unknown) {
    return this.reviews.listReviews(listSchema.parse(query));
  }

  @Post(':id/complete')
  @RequirePermission('training', 'manage')
  complete(
    @Param('id') id: string,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.reviews.complete(uuid.parse(id), this.userId(req));
  }

  @Post(':id/cancel')
  @RequirePermission('training', 'manage')
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = cancelSchema.parse(body ?? {});
    return this.reviews.cancel(
      uuid.parse(id),
      input.reason,
      this.userId(req),
    );
  }
}
