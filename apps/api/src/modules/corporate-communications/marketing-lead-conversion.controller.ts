import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createMarketingAppointmentSchema } from './corporate-communications.schemas';
import { MarketingLeadAppointmentService } from './marketing-lead-appointment.service';
import { MarketingLeadCrmBridgeService } from './marketing-lead-crm-bridge.service';
import { MarketingLeadCustomerBridgeService } from './marketing-lead-customer-bridge.service';

@Controller('corporate-communications/leads')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
export class MarketingLeadConversionController {
  constructor(
    private readonly leadConversionService: MarketingLeadCrmBridgeService,
    private readonly customerBridgeService: MarketingLeadCustomerBridgeService,
    private readonly appointmentService: MarketingLeadAppointmentService,
  ) {}

  @Post(':id/convert-to-crm')
  @RequirePermission('communications', 'manage')
  convertToCrm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadConversionService.convertToCrm(id, user.sub);
  }

  @Post(':id/convert-to-customer')
  @RequirePermission('communications', 'manage')
  convertToCustomer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customerBridgeService.convertToCustomer(id, user.sub);
  }

  @Post(':id/create-appointment')
  @RequirePermission('appointments', 'create')
  createAppointment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appointmentService.createAppointment(
      id,
      createMarketingAppointmentSchema.parse(body),
      user.sub,
    );
  }
}
