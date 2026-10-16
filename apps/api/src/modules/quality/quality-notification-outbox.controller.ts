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
import { QualityNotificationDispatcherService } from './quality-notification-dispatcher.service';
import { QualityNotificationOutboxService } from './quality-notification-outbox.service';

const uuid = z.string().uuid();
const listSchema = z.object({
  status: z
    .enum(['PENDING', 'CLAIMED', 'RETRY', 'SENT', 'DEAD', 'CANCELLED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const claimSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  leaseSeconds: z.coerce.number().int().min(30).max(900).optional(),
});
const markSentSchema = z.object({
  claimToken: z.string().min(32).max(512),
  providerMessageId: z.string().trim().max(200).nullable().optional(),
});
const markFailedSchema = z.object({
  claimToken: z.string().min(32).max(512),
  errorCode: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_.:-]+$/),
});

@Controller('quality/notifications')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class QualityNotificationOutboxController {
  constructor(
    private readonly outbox: QualityNotificationOutboxService,
    private readonly dispatcher: QualityNotificationDispatcherService,
  ) {}

  @Get('outbox')
  @RequirePermission('quality', 'read')
  list(@Query() query: unknown) {
    return this.outbox.list(listSchema.parse(query));
  }

  @Post('enqueue-feedback')
  @RequirePermission('quality', 'manage')
  enqueueFeedback(
    @Query() query: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = limitSchema.parse(query);
    return this.outbox.enqueueFeedbackRequests(
      this.userId(req),
      input.limit,
    );
  }

  @Post('dispatch-feedback')
  @RequirePermission('quality', 'manage')
  dispatchFeedback(
    @Query() query: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = limitSchema.parse(query);
    return this.dispatcher.dispatchFeedbackBatch(
      this.userId(req),
      input.limit,
    );
  }

  @Post('claim')
  @RequirePermission('quality', 'manage')
  claim(
    @Query() query: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = claimSchema.parse(query);
    return this.outbox.claim(
      this.userId(req),
      input.limit,
      input.leaseSeconds,
    );
  }

  @Post(':id/sent')
  @RequirePermission('quality', 'manage')
  markSent(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = markSentSchema.parse(body);
    return this.outbox.markSent(
      uuid.parse(id),
      input.claimToken,
      this.userId(req),
      input.providerMessageId ?? null,
    );
  }

  @Post(':id/failed')
  @RequirePermission('quality', 'manage')
  markFailed(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: { user?: { sub?: string } },
  ) {
    const input = markFailedSchema.parse(body);
    return this.outbox.markFailed(
      uuid.parse(id),
      input.claimToken,
      this.userId(req),
      input.errorCode,
    );
  }

  private userId(req: { user?: { sub?: string } }): string {
    const id = req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user id is missing.');
    }
    return id;
  }
}
