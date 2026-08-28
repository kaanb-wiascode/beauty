import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

import { MembershipsService } from './memberships.service';
import { updateMembershipRoleSchema } from './dto/update-membership-role.dto';

@Controller('memberships')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async findAll() {
    return this.membershipsService.findAll();
  }

  @Patch(':id/role')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async updateRole(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input =
      updateMembershipRoleSchema.parse(body);

    return this.membershipsService.updateRole(
      id,
      input,
    );
  }
}
