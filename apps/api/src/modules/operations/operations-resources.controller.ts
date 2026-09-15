import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  createRoomSchema,
  updateRoomStatusSchema,
  upsertServiceOperationalRequirementSchema,
} from './dto/operations-resource.dto';
import { OperationsResourcesService } from './operations-resources.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/resources')
export class OperationsResourcesController {
  constructor(private readonly resources: OperationsResourcesService) {}

  @Get('rooms')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listRooms() {
    return this.resources.listRooms();
  }

  @Post('rooms')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  createRoom(@Body() body: unknown) {
    return this.resources.createRoom(createRoomSchema.parse(body));
  }

  @Patch('rooms/:id/status')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
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
  @RequirePermission('appointments', 'read')
  listAvailableAssets() {
    return this.resources.listAvailableAssets();
  }

  @Get('services/:serviceId/requirements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  getServiceRequirement(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
  ) {
    return this.resources.getServiceRequirement(serviceId);
  }

  @Put('services/:serviceId/requirements')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  upsertServiceRequirement(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.upsertServiceRequirement(
      serviceId,
      upsertServiceOperationalRequirementSchema.parse(body),
    );
  }
}
