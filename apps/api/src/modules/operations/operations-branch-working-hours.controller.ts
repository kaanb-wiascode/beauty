import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { branchWorkingHoursCheckSchema, updateBranchWorkingHoursSchema } from './dto/branch-working-hours.dto';
import { OperationsBranchWorkingHoursService } from './operations-branch-working-hours.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/branch-working-hours')
export class OperationsBranchWorkingHoursController {
  constructor(private readonly workingHours: OperationsBranchWorkingHoursService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list() {
    return this.workingHours.list();
  }

  @Get('check')
  @RequirePermission('appointments', 'read')
  check(@Query() query: unknown) {
    return this.workingHours.check(branchWorkingHoursCheckSchema.parse(query));
  }

  @Put()
  @RequirePermission('appointments', 'update')
  upsert(@Body() body: unknown) {
    return this.workingHours.upsert(updateBranchWorkingHoursSchema.parse(body));
  }
}
