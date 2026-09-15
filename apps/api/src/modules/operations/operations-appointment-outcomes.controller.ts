import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  appointmentOutcomeTypeSchema,
  createCancellationReasonSchema,
  recordAppointmentOutcomeSchema,
} from './dto/appointment-outcome.dto';
import { OperationsAppointmentOutcomesService } from './operations-appointment-outcomes.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/appointment-outcomes')
export class OperationsAppointmentOutcomesController {
  constructor(private readonly outcomes: OperationsAppointmentOutcomesService) {}

  @Get('reasons')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listReasons(@Query('outcome') outcome?: string) {
    return this.outcomes.listReasons(outcome ? appointmentOutcomeTypeSchema.parse(outcome) : undefined);
  }

  @Post('reasons')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  createReason(@Body() body: unknown) {
    return this.outcomes.createReason(createCancellationReasonSchema.parse(body));
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listRecent(@Query('limit') limit?: string) {
    return this.outcomes.listRecent(limit ? Number(limit) : 100);
  }

  @Post('appointments/:appointmentId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'cancel')
  record(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.outcomes.record(appointmentId, recordAppointmentOutcomeSchema.parse(body));
  }
}
