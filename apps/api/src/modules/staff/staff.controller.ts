import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

import {
  createStaffSchema,
  CreateStaffInput,
} from './dto/create-staff.dto';

import {
  updateStaffSchema,
  UpdateStaffInput,
} from './dto/update-staff.dto';

import {
  listStaffSchema,
  ListStaffInput,
} from './dto/list-staff.dto';

import { StaffService } from './staff.service';
import { staffPerformanceSchema } from './dto/staff-performance.dto';

@Controller('staff')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
  ) {}

  @Post()
    @UseGuards(PermissionsGuard)
    @RequirePermission('staff', 'create')
  async create(@Body() body: unknown) {
    const input: CreateStaffInput =
      createStaffSchema.parse(body);

    return this.staffService.create(input);
  }

  @Get()
    @UseGuards(PermissionsGuard)
    @RequirePermission('staff', 'read')
  async findAll(@Query() query: unknown) {
    const input: ListStaffInput =
      listStaffSchema.parse(query);

    return this.staffService.findAll(input);
  }

  @Get('performance')
    @UseGuards(PermissionsGuard)
    @RequirePermission('reports', 'read')
  async performance(@Query() query: unknown) {
    const input = staffPerformanceSchema.parse(query);

    return this.staffService.performance(input);
  }

  @Get(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('staff', 'read')
  async findOne(@Param('id') id: string) {
    return this.staffService.findOne(id);
  }

  @Patch(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('staff', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input: UpdateStaffInput =
      updateStaffSchema.parse(body);

    return this.staffService.update(id, input);
  }

  @Delete(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('staff', 'delete')
  async archive(@Param('id') id: string) {
    return this.staffService.archive(id);
  }
}
