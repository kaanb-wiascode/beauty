import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import {
  createRebookingSchema,
  upsertRebookingPolicySchema,
} from './dto/rebooking.dto';
import { OperationsRebookingService } from './operations-rebooking.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('operations/rebooking')
export class OperationsRebookingController {
  constructor(private readonly rebooking: OperationsRebookingService) {}

  @Get('opportunities')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  listOpportunities() {
    return this.rebooking.listOpportunities();
  }

  @Get('appointments/:appointmentId/recommendation')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  recommendation(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ) {
    return this.rebooking.getRecommendation(appointmentId);
  }

  @Post('appointments/:appointmentId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'create')
  create(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: unknown,
  ) {
    return this.rebooking.create(
      appointmentId,
      createRebookingSchema.parse(body),
    );
  }

  @Put('services/:serviceId/policy')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  upsertPolicy(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Body() body: unknown,
  ) {
    return this.rebooking.upsertServicePolicy(
      serviceId,
      upsertRebookingPolicySchema.parse(body),
    );
  }
}
