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

import { TemporaryAccessService } from '../temporary-access/temporary-access.service';
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
    private readonly temporaryAccessService: TemporaryAccessService,
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
    const base = await this.membershipsService.findEffectivePermissions(id);
    const temporary = await this.temporaryAccessService.activeForMembership(id);
    const existing = new Set(
      base.permissions.map((permission) => `${permission.resource}.${permission.action}`),
    );
    const temporaryPermissions = temporary
      .filter((grant) => !existing.has(`${grant.resource}.${grant.action}`))
      .map((grant) => ({
        id: grant.permissionId,
        resource: grant.resource,
        action: grant.action,
        description: grant.description,
        source: 'TEMPORARY' as const,
        sourceRole: null,
        temporaryGrant: {
          id: grant.id,
          branchId: grant.branchId,
          startsAt: grant.startsAt,
          endsAt: grant.endsAt,
          reason: grant.reason,
        },
      }));
    const permissions = [...base.permissions, ...temporaryPermissions].sort((a, b) =>
      `${a.resource}.${a.action}`.localeCompare(`${b.resource}.${b.action}`),
    );

    return {
      ...base,
      permissions,
      temporaryAccess: temporary,
      summary: {
        ...base.summary,
        permissionCount: permissions.length,
        temporaryGrantCount: temporary.length,
      },
    };
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
