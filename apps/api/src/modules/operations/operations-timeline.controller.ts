import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { OperationsTimelineService } from './operations-timeline.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/timeline')
export class OperationsTimelineController {
  constructor(private readonly timeline: OperationsTimelineService) {}

  @Get('appointments/:appointmentId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  appointment(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ) {
    return this.timeline.forAppointment(appointmentId);
  }
}
