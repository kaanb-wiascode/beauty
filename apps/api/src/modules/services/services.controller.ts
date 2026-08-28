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
  async create(@Body() body: unknown) {
    const input: CreateServiceInput =
      createServiceSchema.parse(body);

    return this.servicesService.create(input);
  }

  @Get()
  async findAll(@Query() query: unknown) {
    const input: ListServicesInput =
      listServicesSchema.parse(query);

    return this.servicesService.findAll(input);
  }

  @Get('performance')
  async performance(@Query() query: unknown) {
    const input = servicePerformanceSchema.parse(query);

    return this.servicesService.performance(input);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input: UpdateServiceInput =
      updateServiceSchema.parse(body);

    return this.servicesService.update(id, input);
  }

  @Delete(':id')
  async archive(@Param('id') id: string) {
    return this.servicesService.archive(id);
  }
}
