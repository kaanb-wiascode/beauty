import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

import { MembershipsService } from './memberships.service';
import { updateMembershipRoleSchema } from './dto/update-membership-role.dto';
import { updateMembershipStatusSchema } from './dto/update-membership-status.dto';

const updateBranchAccessSchema = z.object({
  branchIds: z.array(z.string().uuid()).max(200),
});

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

  @Get(':id/effective-permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async effectivePermissions(@Param('id') id: string) {
    return this.membershipsService.findEffectivePermissions(id);
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateMembershipStatusSchema.parse(body);

    return this.membershipsService.updateStatus(
      id,
      input,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async remove(@Param('id') id: string) {
    return this.membershipsService.remove(id);
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

  @Patch(':id/branch-access')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async updateBranchAccess(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateBranchAccessSchema.parse(body);
    return this.membershipsService.replaceBranchAccess(
      id,
      input.branchIds,
    );
  }
}
