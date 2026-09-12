import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';

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
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'create')
  async create(@Body() body: unknown) {
    const input = createAppointmentSchema.parse(body);

    return this.appointmentsService.create(input);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  async findAll(@Query() query: unknown) {
    const input = listAppointmentsSchema.parse(query);

    return this.appointmentsService.findAll(input);
  }

  @Get('eligible-sessions')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  async findEligibleSessions(
    @Query('customerId', new ParseUUIDPipe()) customerId: string,
    @Query('serviceId', new ParseUUIDPipe()) serviceId: string,
  ) {
    return this.appointmentsService.findEligibleSessions(
      customerId,
      serviceId,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const input = updateAppointmentSchema.parse(body);

    return this.appointmentsService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'cancel')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.appointmentsService.remove(id);
  }
}
