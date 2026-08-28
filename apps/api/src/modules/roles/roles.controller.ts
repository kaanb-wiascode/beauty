import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

import { RolesService } from './roles.service';
import { createRoleSchema } from './dto/create-role.dto';
import { updateRoleSchema } from './dto/update-role.dto';
import { updateRolePermissionsSchema } from './dto/update-role-permissions.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async create(@Body() body: unknown) {
    const input = createRoleSchema.parse(body);

    return this.rolesService.create(input);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async permissions() {
    return this.rolesService.findPermissions();
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'read')
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateRoleSchema.parse(body);

    return this.rolesService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Patch(':id/permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('roles', 'update')
  async updatePermissions(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input =
      updateRolePermissionsSchema.parse(body);

    return this.rolesService.updatePermissions(
      id,
      input,
    );
  }
}
