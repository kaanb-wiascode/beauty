import {
  BadRequestException,
  Controller,
  Get,
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
import {
  FeedbackRequestStatus,
  QualityFeedbackRequestService,
} from './quality-feedback-request.service';

@Controller('quality/feedback-requests')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityFeedbackRequestController {
  constructor(
    private readonly feedbackRequests: QualityFeedbackRequestService,
  ) {}

  @Get()
  @RequirePermission('quality', 'read')
  list(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    let parsedStatus: FeedbackRequestStatus | undefined;
    if (status) {
      if (!['PENDING', 'SENT', 'OPENED', 'SUBMITTED', 'CANCELLED'].includes(status)) {
        throw new BadRequestException('Invalid feedback request status');
      }
      parsedStatus = status as FeedbackRequestStatus;
    }

    return this.feedbackRequests.list({
      status: parsedStatus,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Post('process-completed')
  @RequirePermission('quality', 'manage')
  processCompleted(
    @Query('limit') limit: string | undefined,
    @Req() req: { user?: { sub?: string } },
  ) {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }

    return this.feedbackRequests.processCompletedAppointments(
      actorUserId,
      limit === undefined ? undefined : Number(limit),
    );
  }
}
