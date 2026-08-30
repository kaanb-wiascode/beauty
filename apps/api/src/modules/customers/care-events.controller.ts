import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { PermissionsGuard } from "../../common/auth/permissions.guard";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { TenantAuthGuard } from "../../common/tenant/tenant-auth.guard";

import {
  createCareEventSchema,
  CreateCareEventInput,
} from "./dto/create-care-event.dto";

import {
  updateCareEventSchema,
  UpdateCareEventInput,
} from "./dto/update-care-event.dto";

import { CareEventsService } from "./care-events.service";

@Controller("customers/:customerId/care-events")
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class CareEventsController {
  constructor(
    private readonly careEventsService: CareEventsService,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission("customers", "read")
  async findAll(
    @Param("customerId") customerId: string,
  ) {
    return this.careEventsService.findAll(customerId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission("customers", "update")
  async create(
    @Param("customerId") customerId: string,
    @Body() body: unknown,
  ) {
    const input: CreateCareEventInput =
      createCareEventSchema.parse(body);

    return this.careEventsService.create(
      customerId,
      input,
    );
  }

  @Patch(":eventId")
  @UseGuards(PermissionsGuard)
  @RequirePermission("customers", "update")
  async update(
    @Param("customerId") customerId: string,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ) {
    const input: UpdateCareEventInput =
      updateCareEventSchema.parse(body);

    return this.careEventsService.update(
      customerId,
      eventId,
      input,
    );
  }

  @Delete(":eventId")
  @UseGuards(PermissionsGuard)
  @RequirePermission("customers", "delete")
  async remove(
    @Param("customerId") customerId: string,
    @Param("eventId") eventId: string,
  ) {
    return this.careEventsService.remove(
      customerId,
      eventId,
    );
  }
}
