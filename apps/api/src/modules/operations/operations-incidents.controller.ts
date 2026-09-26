import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  createOperationsIncidentSchema,
  listOperationsIncidentsSchema,
  resolveOperationsIncidentSchema,
} from './dto/operations-incident.dto';
import { OperationsIncidentsService } from './operations-incidents.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/incidents')
export class OperationsIncidentsController {
  constructor(private readonly incidents: OperationsIncidentsService) {}

  @Get()
  @RequirePermission('appointments', 'read')
  list(@Query() query: unknown) {
    return this.incidents.list(listOperationsIncidentsSchema.parse(query));
  }

  @Post()
  @RequirePermission('appointments', 'update')
  create(@Body() body: unknown) {
    return this.incidents.create(createOperationsIncidentSchema.parse(body));
  }

  @Get(':incidentId/affected-appointments')
  @RequirePermission('appointments', 'read')
  affectedAppointments(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
  ) {
    return this.incidents.affectedAppointments(incidentId);
  }

  @Post(':incidentId/resolve')
  @RequirePermission('appointments', 'update')
  resolve(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() body: unknown,
  ) {
    return this.incidents.resolve(
      incidentId,
      resolveOperationsIncidentSchema.parse(body),
    );
  }
}
