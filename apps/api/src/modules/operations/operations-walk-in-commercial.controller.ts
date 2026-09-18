import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { linkWalkInCommercialContextSchema } from './dto/walk-in-commercial.dto';
import { OperationsWalkInCommercialService } from './operations-walk-in-commercial.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@Controller('operations/walk-in-commercial')
export class OperationsWalkInCommercialController {
  constructor(private readonly commercial: OperationsWalkInCommercialService) {}

  @Get(':visitId')
  @RequirePermission('appointments', 'read')
  get(@Param('visitId', new ParseUUIDPipe()) visitId: string) {
    return this.commercial.get(visitId);
  }

  @Put(':visitId')
  @RequirePermission('appointments', 'update')
  link(@Param('visitId', new ParseUUIDPipe()) visitId: string, @Body() body: unknown) {
    return this.commercial.link(visitId, linkWalkInCommercialContextSchema.parse(body));
  }
}
