import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  sendAppointmentReminderSchema,
  sendCheckoutFollowupSchema,
  updateAppointmentConfirmationSchema,
} from './dto/customer-engagement.dto';
import { OperationsCustomerEngagementService } from './operations-customer-engagement.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/customer-engagement')
export class OperationsCustomerEngagementController {
  constructor(private readonly engagement: OperationsCustomerEngagementService) {}

  @Get('upcoming')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  upcoming(@Query('days') days?: string) {
    const parsed = Number(days ?? 7);
    return this.engagement.listUpcoming(Number.isFinite(parsed) ? parsed : 7);
  }

  @Post('appointments/:appointmentId/reminder')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  reminder(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.sendAppointmentReminder(
      appointmentId,
      sendAppointmentReminderSchema.parse(body),
    );
  }

  @Put('appointments/:appointmentId/confirmation')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  confirmation(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.updateConfirmation(
      appointmentId,
      updateAppointmentConfirmationSchema.parse(body),
    );
  }

  @Post('visits/:visitId/follow-up')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  followup(
    @Param('visitId', new ParseUUIDPipe()) visitId: string,
    @Body() body: unknown,
  ) {
    return this.engagement.sendCheckoutFollowup(
      visitId,
      sendCheckoutFollowupSchema.parse(body),
    );
  }
}
