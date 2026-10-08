import {
  Controller,
  Get,
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
import { QualityFeedbackRequestService } from './quality-feedback-request.service';

const listSchema = z.object({
  status: z
    .enum(['PENDING', 'SENT', 'OPENED', 'SUBMITTED', 'CANCELLED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const processSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

@Controller('quality/feedback-requests')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityFeedbackRequestController {
  constructor(
    private readonly feedbackRequests: QualityFeedbackRequestService,
  ) {}

  @Get()
  @RequirePermission('quality', 'read')
  list(@Query() query: unknown) {
    return this.feedbackRequests.list(listSchema.parse(query));
  }

  @Post('process-completed')
  @RequirePermission('quality', 'manage')
  processCompleted(
    @Query() query: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    const input = processSchema.parse(query);

    return this.feedbackRequests.processCompletedAppointments(
      actorUserId,
      input.limit,
    );
  }
}
