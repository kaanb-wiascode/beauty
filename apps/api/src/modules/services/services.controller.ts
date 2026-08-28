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
  createServiceSchema,
  CreateServiceInput,
} from './dto/create-service.dto';

import {
  updateServiceSchema,
  UpdateServiceInput,
} from './dto/update-service.dto';

import {
  listServicesSchema,
  ListServicesInput,
} from './dto/list-services.dto';

import { servicePerformanceSchema } from './dto/service-performance.dto';

import { ServicesService } from './services.service';

@Controller('services')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
  ) {}

  @Post()
    @UseGuards(PermissionsGuard)
    @RequirePermission('services', 'create')
  async create(@Body() body: unknown) {
    const input: CreateServiceInput =
      createServiceSchema.parse(body);

    return this.servicesService.create(input);
  }

  @Get()
    @UseGuards(PermissionsGuard)
    @RequirePermission('services', 'read')
  async findAll(@Query() query: unknown) {
    const input: ListServicesInput =
      listServicesSchema.parse(query);

    return this.servicesService.findAll(input);
  }

  @Get('performance')
    @UseGuards(PermissionsGuard)
    @RequirePermission('reports', 'read')
  async performance(@Query() query: unknown) {
    const input = servicePerformanceSchema.parse(query);

    return this.servicesService.performance(input);
  }

  @Get(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('services', 'read')
  async findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('services', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input: UpdateServiceInput =
      updateServiceSchema.parse(body);

    return this.servicesService.update(id, input);
  }

  @Delete(':id')
    @UseGuards(PermissionsGuard)
    @RequirePermission('services', 'delete')
  async archive(@Param('id') id: string) {
    return this.servicesService.archive(id);
  }
}
