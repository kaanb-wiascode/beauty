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

import { AppointmentsService } from './appointments.service';
import { createAppointmentSchema } from './dto/create-appointment.dto';
import { listAppointmentsSchema } from './dto/list-appointments.dto';
import { updateAppointmentSchema } from './dto/update-appointment.dto';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const input = createAppointmentSchema.parse(body);

    return this.appointmentsService.create(input);
  }

  @Get()
  async findAll(@Query() query: unknown) {
    const input = listAppointmentsSchema.parse(query);

    return this.appointmentsService.findAll(input);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateAppointmentSchema.parse(body);

    return this.appointmentsService.update(id, input);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}