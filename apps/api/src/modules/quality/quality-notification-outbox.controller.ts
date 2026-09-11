import {
  BadRequestException,
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
import {
  QualityNotificationOutboxService,
  QualityNotificationOutboxStatus,
} from './quality-notification-outbox.service';

@Controller('quality/notifications')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityNotificationOutboxController {
  constructor(private readonly outbox: QualityNotificationOutboxService) {}

  @Get('outbox')
  @RequirePermission('quality', 'read')
  list(@Query('status') status?: string, @Query('limit') limit?: string) {
    let parsedStatus: QualityNotificationOutboxStatus | undefined;
    if (status) {
      if (!['PENDING', 'CLAIMED', 'RETRY', 'SENT', 'DEAD', 'CANCELLED'].includes(status)) {
        throw new BadRequestException('Invalid notification outbox status');
      }
      parsedStatus = status as QualityNotificationOutboxStatus;
    }
    return this.outbox.list({
      status: parsedStatus,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Post('enqueue-feedback')
  @RequirePermission('quality', 'manage')
  enqueueFeedback(
    @Query('limit') limit: string | undefined,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.outbox.enqueueFeedbackRequests(
      this.userId(req),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @Post('claim')
  @RequirePermission('quality', 'manage')
  claim(
    @Query('limit') limit: string | undefined,
    @Query('leaseSeconds') leaseSeconds: string | undefined,
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.outbox.claim(
      this.userId(req),
      limit === undefined ? undefined : Number(limit),
      leaseSeconds === undefined ? undefined : Number(leaseSeconds),
    );
  }

  @Post(':id/sent')
  @RequirePermission('quality', 'manage')
  markSent(
    @Param('id') id: string,
    @Body() body: { claimToken?: string; providerMessageId?: string | null },
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.outbox.markSent(
      id,
      String(body?.claimToken ?? ''),
      this.userId(req),
      body?.providerMessageId ?? null,
    );
  }

  @Post(':id/failed')
  @RequirePermission('quality', 'manage')
  markFailed(
    @Param('id') id: string,
    @Body() body: { claimToken?: string; errorCode?: string },
    @Req() req: { user?: { sub?: string } },
  ) {
    return this.outbox.markFailed(
      id,
      String(body?.claimToken ?? ''),
      this.userId(req),
      String(body?.errorCode ?? ''),
    );
  }

  private userId(req: { user?: { sub?: string } }): string {
    const id = req.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user id is missing.');
    return id;
  }
}
