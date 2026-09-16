import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { createMarketingVendorSchema, listMarketingVendorsSchema, updateMarketingVendorSchema } from './marketing-vendors.schemas';
import { MarketingVendorsService } from './marketing-vendors.service';

@Controller('corporate-communications/vendors')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('communications', 'read')
export class MarketingVendorsController {
  constructor(private readonly service: MarketingVendorsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(listMarketingVendorsSchema.parse(query));
  }

  @Post()
  @RequirePermission('communications', 'manage')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.create(createMarketingVendorSchema.parse(body), user.sub);
  }

  @Patch(':id')
  @RequirePermission('communications', 'manage')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.update(id, updateMarketingVendorSchema.parse(body));
  }
}
