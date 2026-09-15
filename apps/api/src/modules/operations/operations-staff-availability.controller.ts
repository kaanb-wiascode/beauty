import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { staffAvailabilityQuerySchema } from './dto/staff-availability.dto';
import { OperationsStaffAvailabilityService } from './operations-staff-availability.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/staff-availability')
export class OperationsStaffAvailabilityController {
  constructor(
    private readonly availability: OperationsStaffAvailabilityService,
  ) {}

  @Get()
  @RequirePermission('appointments', 'read')
  board(@Query() query: unknown) {
    return this.availability.board(staffAvailabilityQuerySchema.parse(query));
  }
}
