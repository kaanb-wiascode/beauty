import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { resourceCalendarQuerySchema } from './dto/operations-resource.dto';
import { OperationsResourceCalendarService } from './operations-resource-calendar.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/resource-calendar')
export class OperationsResourceCalendarController {
  constructor(private readonly calendar: OperationsResourceCalendarService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Query() query: Record<string, unknown>) {
    return this.calendar.list(resourceCalendarQuerySchema.parse(query));
  }
}
