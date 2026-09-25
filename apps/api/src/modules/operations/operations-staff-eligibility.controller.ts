import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  staffEligibilityCheckSchema,
  updateStaffEligibilityPolicySchema,
} from './dto/staff-eligibility.dto';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/staff-eligibility')
export class OperationsStaffEligibilityController {
  constructor(private readonly eligibility: OperationsStaffEligibilityService) {}

  @Get('policy')
  @RequirePermission('appointments', 'read')
  policy() {
    return this.eligibility.policy();
  }

  @Put('policy')
  @RequirePermission('appointments', 'update')
  updatePolicy(@Body() body: unknown) {
    return this.eligibility.updatePolicy(updateStaffEligibilityPolicySchema.parse(body));
  }

  @Get('check')
  @RequirePermission('appointments', 'read')
  check(@Query() query: unknown) {
    return this.eligibility.check(staffEligibilityCheckSchema.parse(query));
  }
}
