import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { DigitalAssetsService } from './digital-assets.service';
import { createDigitalAssetSchema, listDigitalAssetsSchema } from './digital-assets.schemas';

@Controller('corporate-communications/digital-assets')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('communications', 'read')
export class DigitalAssetsController {
  constructor(private readonly service: DigitalAssetsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.service.list(listDigitalAssetsSchema.parse(query));
  }

  @Post()
  @RequirePermission('communications', 'manage')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.create(createDigitalAssetSchema.parse(body), user.sub);
  }

  @Post(':id/archive')
  @RequirePermission('communications', 'manage')
  archive(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.archive(id, user.sub);
  }
}
