import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  allocateAppointmentResourcesSchema,
  createRoomSchema,
  operationsCapacityQuerySchema,
  releaseAllocationSchema,
  updateRoomStatusSchema,
  upsertServiceOperationalRequirementSchema,
} from './dto/operations-resource.dto';
import { OperationsAllocationService } from './operations-allocation.service';
import { OperationsCapacityService } from './operations-capacity.service';
import { OperationsResourcesService } from './operations-resources.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/resources')
export class OperationsResourcesController {
  constructor(
    private readonly resources: OperationsResourcesService,
    private readonly allocations: OperationsAllocationService,
    private readonly capacity: OperationsCapacityService,
  ) {}

  @Get('capacity')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  getCapacity(@Query() query: Record<string, unknown>) {
    const input = operationsCapacityQuerySchema.parse(query);
    return this.capacity.summary(input);
  }

  @Get('rooms')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  listRooms() {
    return this.resources.listRooms();
  }

  @Post('rooms')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'manage')
  createRoom(@Body() body: unknown) {
    return this.resources.createRoom(createRoomSchema.parse(body));
  }

  @Patch('rooms/:id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'manage')
  updateRoomStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.resources.updateRoomStatus(
      id,
      updateRoomStatusSchema.parse(body),
    );
  }

  @Get('assets')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  listAvailableAssets() {
    return this.resources.listAvailableAssets();
  }

  @Get('services/:serviceId/requirements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  getServiceRequirement(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
  ) {
    return this.resources.getServiceRequirement(serviceId);
  }

  @Put('services/:serviceId/requirements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'manage')
  upsertServiceRequirement(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.upsertServiceRequirement(
      serviceId,
      upsertServiceOperationalRequirementSchema.parse(body),
    );
  }

  @Get('appointments/:appointmentId/allocations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'read')
  listAppointmentAllocations(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ) {
    return this.allocations.listAppointmentAllocations(appointmentId);
  }

  @Post('appointments/:appointmentId/allocations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'manage')
  allocateAppointmentResources(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.allocations.allocate(
      appointmentId,
      allocateAppointmentResourcesSchema.parse(body),
    );
  }

  @Post('allocations/:allocationId/release')
  @UseGuards(PermissionsGuard)
  @RequirePermission('operations', 'manage')
  releaseAllocation(
    @Param('allocationId', new ParseUUIDPipe()) allocationId: string,
    @Body() body: unknown,
  ) {
    return this.allocations.release(
      allocationId,
      releaseAllocationSchema.parse(body),
    );
  }
}
