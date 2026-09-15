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
import { checkInVisitSchema } from './dto/check-in-visit.dto';
import { listVisitsSchema } from './dto/list-visits.dto';
import {
  checkOutVisitSchema,
  transitionVisitSchema,
} from './dto/transition-visit.dto';
import { VisitsService } from './visits.service';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post('check-in')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async checkIn(@Body() body: unknown) {
    return this.visitsService.checkIn(checkInVisitSchema.parse(body));
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  async findAll(@Query() query: unknown) {
    return this.visitsService.findAll(listVisitsSchema.parse(query));
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'read')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.visitsService.findOne(id);
  }

  @Post(':id/transition')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.visitsService.transition(
      id,
      transitionVisitSchema.parse(body),
    );
  }

  @Post(':id/check-out')
  @UseGuards(PermissionsGuard)
  @RequirePermission('appointments', 'update')
  async checkOut(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.visitsService.checkOut(
      id,
      checkOutVisitSchema.parse(body),
    );
  }
}
